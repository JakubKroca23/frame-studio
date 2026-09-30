export interface CameraPose {
  token: string
  position: [number, number, number]
  target: [number, number, number]
}

let pose: CameraPose | null = null

export function rememberPose(token: string, position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) {
  pose = {
    token,
    position: [position.x, position.y, position.z],
    target: [target.x, target.y, target.z],
  }
}

export function recallPose(token: string): CameraPose | null {
  return pose?.token === token ? pose : null
}
