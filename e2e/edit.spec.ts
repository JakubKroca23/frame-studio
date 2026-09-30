import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

async function loadDrawing(page: Page) {
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), 'fixtures/mini-chassis.dxf'))
  await expect(page.getByRole('button', { name: 'Mnohoúhelník' })).toBeVisible()
}

async function rustPixels(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.preview-canvas') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const dpr = canvas.width / rect.width
    const spots: { x: number; y: number }[] = []
    for (let y = 4; y < canvas.height - 4; y += 3) {
      for (let x = 4; x < canvas.width - 4; x += 3) {
        const i = (y * canvas.width + x) * 4
        const r = image.data[i]
        const g = image.data[i + 1]
        const b = image.data[i + 2]
        if (r < 240 || g < 240 || b < 240) continue
        let rust = false
        for (let dy = -6; dy <= 6 && !rust; dy += 3) {
          for (let dx = -6; dx <= 6 && !rust; dx += 3) {
            const j = ((y + dy) * canvas.width + (x + dx)) * 4
            const rr = image.data[j]
            const gg = image.data[j + 1]
            const bb = image.data[j + 2]
            if (rr > 130 && rr < 200 && gg < 80 && bb < 70) rust = true
          }
        }
        if (rust) spots.push({ x: rect.x + x / dpr, y: rect.y + y / dpr })
      }
    }
    return spots
  })
}

test('draws a freeform polygon and drags a vertex and a corner', async ({ page }) => {
  await loadDrawing(page)
  await page.getByRole('button', { name: 'Mnohoúhelník' }).click()
  const canvas = page.locator('canvas.preview-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no box')
  const x = box.x + box.width * 0.42
  const y = box.y + box.height * 0.32
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 140, y + 10, { steps: 6 })
  await page.mouse.move(x + 150, y + 110, { steps: 6 })
  await page.mouse.move(x + 20, y + 120, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByRole('heading', { name: 'Nový obrys' })).toBeVisible()
  await page.getByRole('button', { name: 'Mnohoúhelník' }).click()
  const length = page.locator('.review-form input').first()
  const before = Number(await length.inputValue())
  expect(before).toBeGreaterThan(10)

  const spots = await rustPixels(page)
  expect(spots.length).toBeGreaterThan(0)
  let changed = false
  for (const vertex of spots.slice(0, 6)) {
    await page.mouse.move(vertex.x, vertex.y)
    await page.mouse.down()
    await page.mouse.move(vertex.x + 70, vertex.y + 40, { steps: 8 })
    await page.mouse.up()
    const next = Number(await length.inputValue())
    if (next !== before) {
      changed = true
      break
    }
  }
  expect(changed).toBe(true)

  await page.locator('.review-item', { hasText: 'Rám' }).first().click()
  await expect(page.getByRole('heading', { name: 'Rám' })).toBeVisible()
  const fields = page.locator('.review-form input')
  const beforeFields = await fields.evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))
  const handles = await rustPixels(page)
  expect(handles.length).toBeGreaterThan(0)
  let resized = false
  for (const handle of [handles[0], handles[Math.floor(handles.length / 2)], handles[handles.length - 1]]) {
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x + 40, handle.y + 28, { steps: 8 })
    await page.mouse.up()
    const after = await fields.evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))
    if (after.some((value, index) => value !== beforeFields[index])) {
      resized = true
      break
    }
  }
  expect(resized).toBe(true)
})
