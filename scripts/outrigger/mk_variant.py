import trimesh,numpy as np,json
src='/home/box/agent-data/agents/c35509af-3de3-4e97-be62-d55e3561060c/attachments/7247b27094ca7794f2fc82d680fbfa7ca23340f303c296094cac957721ecb2d1.glb'
s=trimesh.load(src)
DL=0.060; KY=345/358.0; YC=-0.0015; FOOT5=0.148; FOOT6=0.172; X0,X1=0.20,1.10; KZ=457.3/426.0
cx=(s.bounds[0][0]+s.bounds[1][0])/2; cz=(s.bounds[0][2]+s.bounds[1][2])/2
f=lambda x: x+DL*np.clip((x-X0)/(X1-X0),0,1)-DL/2
out=trimesh.Scene(); out5=trimesh.Scene(); st=[]
for n in s.graph.nodes_geometry:
  T,g=s.graph[n]; m=s.geometry[g].copy(); m.apply_transform(T); out5.add_geometry(m.copy(),node_name=n,geom_name=n)
  b=m.bounds; v=m.vertices.copy()
  if b[1][0]-b[0][0]>1.0:
    v[:,0]=f(v[:,0]); v[:,2]=cz+(v[:,2]-cz)*KZ; v[:,1]=YC+(v[:,1]-YC)*KY; st.append(n)
  else:
    c=m.centroid if False else (b[0]+b[1])/2
    v[:,0]+=f(c[0])-c[0]; v[:,2]=cz+(v[:,2]-cz)*KZ
    end = c[0] < -0.37 or c[0] > 1.68   # sloupy/nohy/patky na koncích
    if end:  # rozteč noh v šířce 147 -> 172: posun celé koncové sestavy v Z
      sgn = 1 if c[0] > 0.65 else -1
      v[:,2] += sgn*(FOOT6-FOOT5*KZ)/2
    else:    # díly na nosníku: výška nosníku 358 -> 345
      v[:,1] += (YC+(c[1]-YC)*KY)-c[1]
  m.vertices=v; out.add_geometry(m,node_name=n,geom_name=n)
for sc,p in((out5,'outrigger-aux-5m.glb'),(out,'outrigger-aux-6m.glb')): sc.export(p)
r5=out5.bounds; r6=out.bounds
print('stretched',len(st),st)
print('5m',(r5[1]-r5[0]).round(4),'6m',(r6[1]-r6[0]).round(4))
# housing width: Z extent of long parts
def wz(sc):
  zs=[sc.geometry[g].bounds for g in sc.geometry if sc.geometry[g].bounds[1][0]-sc.geometry[g].bounds[0][0]>1.0]
  return min(z[0][2] for z in zs),max(z[1][2] for z in zs),min(z[0][0] for z in zs),max(z[1][0] for z in zs)
print(wz(out5),wz(out))
