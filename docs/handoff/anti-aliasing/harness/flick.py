"""Flicker of the card frames from cards.mjs: mean |second difference| over mean light, and sharpness.
python -I flick.py <outDir>"""
import sys, os, json, glob, numpy as np
from PIL import Image
from concurrent.futures import ProcessPoolExecutor
def lin(a): a=a/255.0; return np.where(a<=0.04045,a/12.92,((a+0.055)/1.055)**2.4)
def load(d):
    m=json.load(open(f'{d}/meta.json')); k=m['k']
    fr=[]
    for p in sorted(glob.glob(f'{d}/*.png')):
        a=lin(np.asarray(Image.open(p).convert('RGB'),float)).mean(2)
        if k>1:
            h,w=a.shape[0]//k,a.shape[1]//k; a=a[:h*k,:w*k].reshape(h,k,w,k).mean((1,3))
        fr.append(a)
    h=min(f.shape[0] for f in fr); w=min(f.shape[1] for f in fr)
    return m, np.stack([f[:h,:w] for f in fr])
def run(d):
    m,F=load(d)
    s2=np.abs(F[2:]-2*F[1:-1]+F[:-2]).mean()
    gx=np.abs(np.diff(F,axis=2)).mean()
    return os.path.basename(d), s2/F.mean(), gx/F.mean()
if __name__=='__main__':
    ds=sorted(d for d in glob.glob(sys.argv[1]+'/*') if os.path.isdir(d))
    with ProcessPoolExecutor() as ex:
        for n,f,g in ex.map(run,ds): print(f'{n:30s} flicker {f:.4f}  sharp {g:.4f}')
