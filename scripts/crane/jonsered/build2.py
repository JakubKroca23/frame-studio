"""Jonsered iZ.18R HD – v2: classes from cls3 (connectivity + planes + contact-island fixes), lift cylinder split
(barrel on column pin A, rod on main pin B), frame origin = column shaft axis (ring fit), pins from ring fits."""
import trimesh,numpy as np,json,collections
from rot import R, XA, ZA, K
from islands import islands
m=trimesh.load('all.glb',force='mesh'); lab=np.load('lab.npy'); F=m.faces; V0=m.vertices; VR=R(V0)
order=np.argsort(lab,kind='stable'); ls=lab[order]; cuts=np.flatnonzero(np.diff(ls))+1; groups=np.split(order,cuts)
cls=np.load('cls3.npy',allow_pickle=True).copy()
# --- measured (rotated frame x', y, z') ---
AX=np.array([0.0101,0.0007])          # column shaft axis (spline shaft ring fit, 5 slices, ±0.1 mm)
P1=np.array([0.3061,2.4457])          # main pivot: 8 concentric rings r 40 mm, z' ±0.15
P2=np.array([-1.409,-0.359])          # knuckle: rings r 40/66 mm, z' ±0.16
A=np.array([-0.238,0.653])            # lift cylinder, column pin: 11 rings r 35–38 mm
B=np.array([0.0451,1.9502])           # lift cylinder, rod eye on main: ring r 72 mm
MOUNT=P1[1]-2.449                     # mounting plane: P1 is 2449 above it (drawing kóta 1-4)
c=1/np.sqrt(1+K*K); axG=np.array([XA+c*(AX[0]-K*AX[1]), ZA+c*(AX[1]+K*AX[0])])  # shaft axis in GLB x,z
# --- outer boom plates/tube that start at the knuckle (a.min≈−0.1 along the outer axis) were taken by the main-band rule:
#     anything of 'main' touching P2 that runs ≥0.4 m along the outer axis inside the outer band is outer (L11) ---
TOP=np.array([-0.595,2.733]); uo=(TOP-P2)/np.linalg.norm(TOP-P2); no=np.array([-uo[1],uo[0]]); moved=[]
for i,g in enumerate(groups):
  if cls[i]!='main': continue
  Q=VR[np.unique(F[g].ravel())]; d=np.hypot(Q[:,0]-P2[0],Q[:,1]-P2[1])
  if d.min()>0.2: continue
  a=(Q[:,:2]-P2)@uo; p=(Q[:,:2]-P2)@no
  inner=np.abs(Q[:,2]).max()<=0.1355 and not (d.max()<0.07)   # inside the main tip lugs (|z'| 0.14–0.17); 0.07 = the pin itself stays
  if inner and ((a.max()>0.4 and np.abs(p).max()<0.25) or d.max()<0.2): cls[i]='outer'; moved.append((i,len(g)))
print('main→outer at knuckle',len(moved),sum(n for _,n in moved))
# hose strip from the main heel down the column (in the parked pose it lies along the column; on the main it sticks out
# sideways when the main is raised) → column (flexible hose, ASSUMED rigid with the column)
for i in (24305,24306): cls[i]='column'
# --- lift cylinder components: inside the envelope around A–B ---
u=(B-A)/np.linalg.norm(B-A); nrm=np.array([-u[1],u[0]]); L0=np.linalg.norm(B-A)
lift=[]
for i,g in enumerate(groups):
  if cls[i] not in ('column','main'): continue
  Q=VR[np.unique(F[g].ravel())]; q=Q[:,:2]-A; t=q@u; d=q@nrm; rr=np.hypot(d,Q[:,2])
  if rr.max()<0.135 and t.min()>-0.12 and t.max()<L0+0.12:
    near_pin=np.hypot(*(Q[:,:2]-B).T).max()<0.13 and np.abs(Q[:,2]).max()<0.07
    cls[i]='liftRod' if (t.min()>1.15 or near_pin) else 'liftCyl'; lift.append(i)
print('lift comps',collections.Counter(cls[lift]))
# --- automatic connectivity check: every group one contact cluster, except tiny known islands ---
cc,out=islands(cls)
KNOWN={('main',50546),('stabL',17950),('outer',9433)}  # knuckle side link pad (touches only the rest pad when parked), stab leg-housing cap (CAD gap), outer heel plates with the P2 bore (welded to the box with a >10 mm CAD gap)
bad=[o for o in out if o[2]>3000 and (o[0],int(o[2])) not in KNOWN]
rep={'islands':{g:int(sum(o[2] for o in out if o[0]==g)) for g in np.unique(cls)},'islandsBig':[(o[0],int(o[2])) for o in out if o[2]>3000]}
print(rep)
assert not bad, bad
def frame(P,rot):
  if not rot: return np.c_[P[:,0]-axG[0],P[:,1]-MOUNT,P[:,2]-axG[1]]
  Q=R(P); return np.c_[Q[:,2]-AX[1],Q[:,1]-MOUNT,-(Q[:,0]-AX[0])]
def pin(p): return {'r':round(float(AX[0]-p[0]),4),'h':round(float(p[1]-MOUNT),4)}
pins={'p1':pin(P1),'p2':pin(P2),'liftA':pin(A),'liftB':pin(B),'axisGLB':axG.round(4).tolist(),'mount':round(float(MOUNT),4)}
print(pins)
sc=trimesh.Scene(); samples={}
rng=np.random.default_rng(0)
names=['base','stabL','stabR','legL','legR','column','liftCyl','liftRod','main','outer','ext1','ext2']
for name in names:
  sel=np.flatnonzero(cls==name)
  idx=np.concatenate([groups[i] for i in sel])
  fs=F[idx]; vi,inv=np.unique(fs.ravel(),return_inverse=True)
  rot=name not in('base','stabL','stabR','legL','legR')
  mesh=trimesh.Trimesh(frame(V0[vi],rot),inv.reshape(-1,3),process=False)
  if name=='liftRod':  # rod tube is not in the CAD (hidden in the barrel) → synthetic Ø90 rod, ASSUMED, length = max stroke
    bm=np.array([0,pins['liftB']['h'],pins['liftB']['r']]); am=np.array([0,pins['liftA']['h'],pins['liftA']['r']])
    dirv=(am-bm)/np.linalg.norm(am-bm); Lr=1.15
    cy=trimesh.creation.cylinder(radius=0.045,height=Lr,sections=24)
    T=trimesh.geometry.align_vectors([0,0,1],dirv); T[:3,3]=bm+dirv*Lr/2; cy.apply_transform(T)
    mesh=trimesh.util.concatenate([mesh,cy])
  sc.graph.update(frame_from='world',frame_to=name,matrix=np.eye(4))
  sc.add_geometry(mesh,geom_name=name+'_m',node_name=name+'_m',parent_node_name=name)
  pts,_=trimesh.sample.sample_surface(mesh,1500,seed=1) if 'seed' in trimesh.sample.sample_surface.__code__.co_varnames else trimesh.sample.sample_surface(mesh,1500)
  samples[name]=np.round(pts*1000).astype(int).ravel().tolist()
  print(name,len(fs),(mesh.bounds*1000).round(0).tolist())
sc.export('jonsered-iz18r-articulated.glb')
np.save('cls4.npy',cls)
json.dump({'pins':pins,'report':rep,'samplesMm':samples},open('jonsered-parts.json','w'))
