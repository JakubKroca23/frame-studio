import type { ChassisModel, ChassisParams } from '../model/types'
import type { TrwImport } from '../trw/trwConfig'

/** What the home scene drives out of the hall: the same chassis model the target page will show. */
export interface HomeVehicle {
  model: ChassisModel
  params: ChassisParams
  /** trw superstructure markers (crane, outriggers) + frame top for TrwMarkers. */
  trw?: { markers: TrwImport['markers']; frameTop: number }
}

export type DoorKind = 'dxf' | 'trw' | 'spec'

/** Converted .trw projects, so the configurator does not upload the same file twice. */
const trwConversions = new WeakMap<File, Promise<import('../trw/fromTrw').FromTrwImport>>()
export function takeTrwConversion(file: File) {
  const p = trwConversions.get(file)
  trwConversions.delete(file)
  return p
}

async function fromPreset(preset: import('../presets').ChassisPreset, trw?: TrwImport): Promise<HomeVehicle> {
  const { configToModel, paramsForConfig } = await import('../presets/configModel')
  const model = configToModel(preset.config, preset.id)
  return { model, params: paramsForConfig(preset.config), trw: trw ? { markers: trw.markers, frameTop: preset.config.frame.topHeight } : undefined }
}

/**
 * Builds the vehicle with the existing pipelines (lazy imports keep the start page light):
 * trw → convertTrwFile / mapTrwExport, PDF → parseSpec + specToConfig, DXF → state.loadFile (the drawing flow's own parse).
 */
export async function vehicleFromFile(kind: DoorKind, file: File, loadDrawing: (f: File) => Promise<void>): Promise<HomeVehicle | null> {
  if (kind === 'dxf') {
    await loadDrawing(file)
    const [{ useApp }, { sceneModel }] = await Promise.all([import('../state'), import('../pipeline/review')])
    const st = useApp.getState()
    if (!st.source) return null
    return { model: sceneModel(st.source, st.review), params: st.params }
  }
  if (kind === 'spec' || /\.pdf$/i.test(file.name)) {
    const [{ pdfToText }, { parseSpec, specToConfig }] = await Promise.all([import('../spec/pdfText'), import('../spec')])
    const res = specToConfig(parseSpec(await pdfToText(await file.arrayBuffer())), file.name)
    return fromPreset(res.preset)
  }
  const fromTrw = await import('../trw/fromTrw')
  if (/\.trw$/i.test(file.name)) {
    const p = fromTrw.convertTrwFile(file)
    trwConversions.set(file, p)
    const res = await p
    return fromPreset(res.preset, res)
  }
  const text = await file.text()
  if (fromTrw.classifyFile(file.name, text) !== 'trw-config') return null
  const { mapTrwExport } = await import('../trw/trwConfig')
  const res = mapTrwExport(fromTrw.unwrapConfig(JSON.parse(text)))
  return fromPreset(res.preset, res)
}
