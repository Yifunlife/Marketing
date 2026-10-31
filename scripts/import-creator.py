"""Import creator-center exports downloaded through the supported browser UI.
No browser cookies, passwords, private APIs or secrets are read by this script.
"""
import argparse,datetime,hashlib,json,os,re,subprocess,tempfile,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
PROJECT=Path(__file__).resolve().parents[1]
TZ=datetime.timezone(datetime.timedelta(hours=8))
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
FIELDS={'曝光趋势':'impressions','观看趋势':'views','封面点击率趋势':'cover_ctr','平均观看时长趋势':'avg_watch_seconds','观看总时长趋势':'watch_seconds','视频完播率趋势':'completion_rate','点赞趋势':'likes','评论趋势':'comments','收藏趋势':'collects','分享趋势':'shares','净涨粉趋势':'net_followers','新增关注趋势':'new_followers','取消关注趋势':'lost_followers','主页访客趋势':'profile_visits','主页转粉率趋势':'profile_follow_rate','总发布趋势':'posts','发布视频趋势':'video_posts','发布图文趋势':'image_posts'}
GROUPS={'观看':['impressions','views'],'互动':['likes','comments','collects','shares'],'涨粉':['net_followers','new_followers','lost_followers'],'发布':['posts','video_posts','image_posts']}
def workbook(path):
 with zipfile.ZipFile(path) as z:
  if sum(i.file_size for i in z.infolist())>20*1024*1024: raise ValueError('Workbook too large')
  strings=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in z.namelist() else []
  rel={n.get('Id'):n.get('Target') for n in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
  sheets={}
  for n in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS):
   target=rel[n.get('{'+NS['r']+'}id')];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
   rows=[]
   for row in ET.fromstring(z.read(target)).findall('.//s:row',NS):
    cells=[]
    for cell in row:
     v=cell.find('s:v',NS)
     if cell.get('t')=='s': text=strings[int(v.text)]
     elif cell.get('t')=='inlineStr': text=''.join(cell.find('s:is',NS).itertext())
     else: text=v.text if v is not None else ''
     cells.append(text)
    rows.append(cells)
   sheets[n.get('name')]=rows
  return sheets

def parse(paths,as_of):
 daily={};expected_dates=None
 for group,path in paths.items():
  sheets=workbook(path);found=set();dates_for_file=None
  for title,rows in sheets.items():
   key=FIELDS.get(title)
   if not key: continue
   dates=set();found.add(key)
   for row in rows[1:]:
    if len(row)!=2: raise ValueError('Unexpected report columns')
    m=re.fullmatch(r'(\d{4})年(\d{1,2})月(\d{1,2})日',row[0])
    if not m: raise ValueError('Unrecognized date')
    date=datetime.date(*map(int,m.groups())).isoformat()
    if date in dates: raise ValueError('Duplicate date')
    dates.add(date); value=float(re.sub(r'[%秒]','',row[1]))
    if not (-1000000000<value<1000000000): raise ValueError('Invalid number')
    if key!='net_followers' and value<0: raise ValueError('Negative count')
    daily.setdefault(date,{})[key]=value
   if dates_for_file is not None and dates!=dates_for_file: raise ValueError('Incomplete metric coverage')
   dates_for_file=dates
  if not set(GROUPS[group]).issubset(found): raise ValueError('Missing report metrics: '+group)
  if expected_dates is not None and dates_for_file!=expected_dates: raise ValueError('Report periods differ')
  expected_dates=dates_for_file
 if not expected_dates: raise ValueError('No dates')
 yesterday=as_of-datetime.timedelta(days=1)
 wanted={(yesterday-datetime.timedelta(days=i)).isoformat() for i in range(30)}
 if expected_dates!=wanted: raise ValueError('Reports are stale or not the latest 30 days')
 for date,row in daily.items():
  if row['net_followers']!=row['new_followers']-row['lost_followers']: raise ValueError('Follower counts do not reconcile')
  if row['posts']!=row['video_posts']+row['image_posts']: raise ValueError('Post counts do not reconcile')
 return daily

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--account-id',required=True,choices=['49314445652']);ap.add_argument('--account-name',required=True);ap.add_argument('--fans',required=True,type=int);ap.add_argument('--directory',required=True,type=Path);ap.add_argument('--as-of',default=datetime.datetime.now(TZ).date().isoformat());ap.add_argument('--apply',action='store_true');args=ap.parse_args()
 if args.account_name!='上海亦玩游乐设备集团' or args.fans<0: raise ValueError('Wrong account identity')
 as_of=datetime.date.fromisoformat(args.as_of);paths={g:args.directory/('近30日'+g+'数据.xlsx') for g in GROUPS}
 for path in paths.values():
  if abs(datetime.datetime.now().timestamp()-path.stat().st_mtime)>7200: raise ValueError('Export is not fresh; download again')
 daily=parse(paths,as_of);now=int(datetime.datetime.now().timestamp()*1000)
 summary={'account_id':args.account_id,'fans':args.fans,'start':min(daily),'end':max(daily),'days':len(daily),'yesterday':daily[max(daily)],'totals':{k:sum(v[k] for v in daily.values()) for k in ['posts','net_followers','impressions','views','likes','comments','collects','shares']}}
 if args.apply:
  node='/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node'
  wrangler='/Applications/Yifun Workplace.app/Contents/Resources/dependencies/procurement/.pnpm/wrangler@4.131.0_@cloudflare+workers-types@5.20260910.1/node_modules/wrangler/bin/wrangler.js'
  env={**os.environ,'HTTPS_PROXY':'http://127.0.0.1:7897','HTTP_PROXY':'http://127.0.0.1:7897'}
  def run(*params):subprocess.run([node,wrangler,*params],cwd=PROJECT,env=env,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
  for group,path in paths.items():
   key='creator/'+args.account_id+'/'+args.as_of+'/'+group+'-'+hashlib.sha256(path.read_bytes()).hexdigest()[:16]+'.xlsx'
   run('r2','object','put','yifun-marketing-files/'+key,'--file',str(path),'--content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','--remote')
  quote=lambda s:"'"+str(s).replace("'","''")+"'"
  sql=['INSERT INTO creator_accounts(account_id,display_name,fans,fans_source,observed_at,last_success_at) VALUES('+','.join(map(quote,[args.account_id,args.account_name,args.fans,'创作服务平台粉丝数据页（页面未标总数截止时间）',now,now]))+') ON CONFLICT(account_id) DO UPDATE SET fans=excluded.fans,observed_at=excluded.observed_at,last_success_at=excluded.last_success_at;']
  for date,row in sorted(daily.items()):sql.append('INSERT INTO creator_daily(account_id,date,metrics_json,observed_at) VALUES('+','.join(map(quote,[args.account_id,date,json.dumps(row,separators=(',',':')),now]))+') ON CONFLICT(account_id,date) DO UPDATE SET metrics_json=excluded.metrics_json,observed_at=excluded.observed_at;')
  with tempfile.NamedTemporaryFile(mode='w',suffix='.sql',delete=False) as f:f.write('\n'.join(sql));filename=f.name
  try:run('d1','execute','DB','--remote','--file',filename)
  finally:Path(filename).unlink(missing_ok=True)
  summary['saved']='D1';summary['original_reports']='R2'
 print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
