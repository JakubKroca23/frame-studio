"""Rozdělí model přídavných podpěr na pohyblivé skupiny a vytvoří 5m + 6m GLB.
Skupiny (uzly GLB): housing (pevný), armL/armR (výsuv do boku, -X / +X), legL/legR (výsuv dolů, -Y).
Model v m, X = délka podpěry (napříč vozem), Y nahoru, Z = podél vozu."""
import trimesh,numpy as np,json,sys,re
src=sys.argv[1]; s=trimesh.load(src)
ARM_L={'(18)-1','(18)-2','(19)-1','(20)-1'}; ARM_R={'(18)-3','(18)-4','(19)-2','(20)-2'}
LEG=re.compile(r'\((39|40|41|67)\)|\(36\)_2')
X_END_L,X_END_R=-0.37,1.68
def parts():
  for n in s.graph.nodes_geometry:
    T,g=s.graph[n]; m=s.geometry[g].copy(); m.apply_transform(T); yield n,m
def group(n,b):
  c=(b[0]+b[1])/2; k=n[n.index('('):]
  if k in ARM_L: return 'armL'
  if k in ARM_R: return 'armR'
  if c[0]<X_END_L: return 'legL' if LEG.search(k) else 'armL'
  if c[0]>X_END_R: return 'legR' if LEG.search(k) else 'armR'
  if c[1]>0.22: return 'armL' if c[0]<0.65 else 'armR'  # díly nad nosníkem = sloup/hadice na konci ramene
  return 'housing'
def variant(dl,kz,ky,foot5,foot6):
  b0=s.bounds; cz=(b0[0][2]+b0[1][2])/2; X0,X1=0.20,1.10; YC=-0.0015
  f=lambda x: x+dl*np.clip((x-X0)/(X1-X0),0,1)-dl/2
  out={}
  for n,m in parts():
    b=m.bounds; c=(b[0]+b[1])/2; v=m.vertices.copy(); g=group(n,b)
    if b[1][0]-b[0][0]>1.0:
      v[:,0]=f(v[:,0]); v[:,2]=cz+(v[:,2]-cz)*kz; v[:,1]=YC+(v[:,1]-YC)*ky
    else:
      v[:,0]+=f(c[0])-c[0]; v[:,2]=cz+(v[:,2]-cz)*kz
      if c[0]<X_END_L or c[0]>X_END_R: v[:,2]+=(1 if c[0]>0.65 else -1)*(foot6-foot5*kz)/2
      else: v[:,1]+=(YC+(c[1]-YC)*ky)-c[1]
    if g.startswith('leg'): print(g,n)
    m.vertices=v; out.setdefault(g,[]).append(m)
  sc=trimesh.Scene()
  for g,ms in out.items():
    sc.graph.update(frame_from='world',frame_to=g,matrix=np.eye(4))
    for i,m in enumerate(ms): sc.add_geometry(m,geom_name=f'{g}_{i}',node_name=f'{g}_{i}',parent_node_name=g)
  return sc,{g:len(ms) for g,ms in out.items()}
for name,args in (('5m',(0,1,1,0.148,0.148)),('6m',(0.060,457.3/426,345/358,0.148,0.172))):
  sc,cnt=variant(*args); sc.export(f'g-{name}.glb'); print(name,cnt,(sc.extents*1000).round(1))
