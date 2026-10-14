import json,sys,os
from PIL import Image
d=sys.argv[1]; n=int(sys.argv[2]) if len(sys.argv)>2 else 16
a=float(sys.argv[3]) if len(sys.argv)>3 else None; b=float(sys.argv[4]) if len(sys.argv)>4 else None
J=json.load(open(os.path.join(d,'stamps.json'))); st=J['stamps']
a=a if a is not None else st[0][1]/1000; b=b if b is not None else st[-1][1]/1000
cols=4; rows=(n+cols-1)//cols; W,H=480,270
sheet=Image.new('RGB',(cols*W,rows*H+0))
from PIL import ImageDraw
for i in range(n):
  t=(a+(b-a)*i/(n-1))*1000
  f=min(st,key=lambda s:abs(s[1]-t))[0]
  im=Image.open(os.path.join(d,f)).convert('RGB').resize((W,H))
  ImageDraw.Draw(im).text((6,4),f'{t/1000:.2f}s',fill=(255,255,0))
  sheet.paste(im,((i%cols)*W,(i//cols)*H))
sheet.save(sys.argv[5] if len(sys.argv)>5 else os.path.join(d,'..',os.path.basename(d)+'_sheet.jpg'),quality=85)
