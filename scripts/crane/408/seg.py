import numpy as np, json, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
T=np.fromfile('tris.f32',dtype=np.float32).reshape(-1,3,3).astype(np.float64)
pid=np.fromfile('pid.i32',dtype=np.int32).reshape(-1,2)[:,0]
names=json.load(open('names.json'))['names']
o=np.argsort(pid); ps=pid[o]; cuts=np.searchsorted(ps,np.arange(len(names)+1))
u=np.array([0,0.535,0.845]);u/=np.linalg.norm(u); w=np.array([0,0.845,-0.535])
tips={1:-1.367,2:-1.405,3:-1.443,4:-1.538,5:-1.718,6:-1.808}
P55=np.array([-0.417,-1.965]); P220=np.array([1.137,-0.136])  # (z,y)
G={}
seen={}
for k in range(len(names)):
    t=T[o[cuts[k]:cuts[k+1]]]
    if len(t)==0: continue
    P=t.reshape(-1,3); c=P.mean(0); lo=P.min(0); hi=P.max(0)
    key=(len(t),tuple(np.round(lo,4)),tuple(np.round(hi,4)))
    if key in seen: G[k]='dup'; continue
    seen[key]=k
    wc=c@w; a=P@u
    zy=np.array([c[2],c[1]]); d=P220-P55; s=np.clip((zy-P55)@d/(d@d),0,1); dist=np.linalg.norm(zy-(P55+s*d))
    if c[0]<-0.735 and abs(wc+0.65)<0.45:
        if a.min()>-1.12: g='outer'
        else:
            g='ext6'
            for kk in range(1,7):
                if tips[kk]<=a.min()+0.02: g=f'ext{kk}'; break
    elif -0.75<c[0]<-0.22 and dist<0.33 and 0.02<s<1.05 and c[1]<-0.05:
        g='main'
    elif -0.9<c[0]<-0.07 and -2.2<c[1]<-0.14 and -0.75<c[2]<0.4:
        g='column'
    else: g='base'
    G[k]=g
json.dump(G,open('groups_assign.json','w'))
from collections import Counter
print(Counter(G.values()))
cols={'base':'#888888','column':'#1f77b4','main':'#d62728','outer':'#2ca02c','ext1':'#ff7f0e','ext2':'#9467bd','ext3':'#8c564b','ext4':'#e377c2','ext5':'#17becf','ext6':'#bcbd22','dup':None}
gid=np.array([list(cols).index(G.get(int(p),'base')) for p in pid])
keep=gid!=list(cols).index('dup')
C=T.mean(1)
fig,ax=plt.subplots(1,3,figsize=(24,8))
palette=[matplotlib.colors.to_rgb(c) if c else (1,1,1) for c in cols.values()]
for a,(i,j,dd,sg,n) in zip(ax,[(0,1,2,1,'x-y'),(2,1,0,-1,'z-y'),(0,2,1,-1,'x-z')]):
    m=keep; idx=np.argsort(C[m][:,dd]*sg)
    pts=C[m][idx]; cc=np.array(palette)[gid[m][idx]]
    a.scatter(pts[:,i],pts[:,j],s=0.3,c=cc); a.set_aspect('equal'); a.set_title(n); a.grid(True)
for nm,c in cols.items():
    if c: ax[0].scatter([],[],c=c,label=nm)
ax[0].legend()
plt.savefig('seg.png',dpi=55,bbox_inches='tight')
