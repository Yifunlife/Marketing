// Normalize only for reporting; preserve the customer's original country field.
const crmCountryCodes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' ');
const crmCountryKey=value=>value.normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const crmCountryAliases=new Map();

const crmCountryDisplayNames=['zh-CN','zh-TW','en','es','fr','ru','ar'].map(locale=>new Intl.DisplayNames([locale],{type:'region'}));
for(const code of crmCountryCodes){crmCountryAliases.set(crmCountryKey(code),code);for(const displayNames of crmCountryDisplayNames){const name=displayNames.of(code);if(name)crmCountryAliases.set(crmCountryKey(name),code);}}
for(const [code,names] of Object.entries({US:['USA','United States of America','Соединенные Штаты Америки','美国','美國'],CN:['CHN','中国大陆','中国内地','中华人民共和国','mainland china'],AU:['澳洲','澳大利亚'],AE:['阿联酋'],GB:['UK','英国'],BD:['孟加拉'],DO:['多米尼加']}))for(const name of names)crmCountryAliases.set(crmCountryKey(name),code);
function crmCountryCode(value){
 const raw=String(value||'').trim();if(!raw)return null;
 let code=crmCountryAliases.get(crmCountryKey(raw));
 // Some historical forms stored a truncated country object. Its explicit code is usable.
 if(!code&&raw.startsWith('{')){const embedded=/"code"\s*:\s*"([A-Za-z]{2})"/.exec(raw)?.[1]?.toUpperCase();if(embedded&&crmCountryCodes.includes(embedded))code=embedded;}
 if(!code&&raw.includes('('))code=crmCountryAliases.get(crmCountryKey(raw.split('(')[0]));
 return code||null;
}

// Use the same classification and active staff scope as the CRM sales dashboard.
const crmSalesBranchOwners = "('b7e34925-ec83-4f4e-ad42-04be344dc82b','33e3947e-976c-4521-8128-7a18e60ed462')";
const crmSalesDetail = "CASE WHEN json_valid(l.detail) THEN l.detail ELSE '{}' END";

function crmSalesMarketFields(owner, scope) {
 return `l.country,l.source,${scope} AS business_scope,
  json_extract(${crmSalesDetail},'$.客资市场') AS market_tag,
  json_extract(${crmSalesDetail},'$._sales_company') AS company,
  (${owner} IN ${crmSalesBranchOwners}) AS branch_owner`;
}

function crmSalesReportDay(field) {
 const value = `trim(replace(${field},'/','-'))`;
 const tail = `substr(${value},6)`;
 return `CASE WHEN instr(${field},'T')>0 THEN date(${field},'+8 hours')
  WHEN length(${value}) BETWEEN 8 AND 10 AND substr(${value},5,1)='-'
   AND instr(${tail},'-')>0
  THEN date(printf('%04d-%02d-%02d',substr(${value},1,4),${tail},substr(${tail},instr(${tail},'-')+1)))
 END`;
}

function crmSalesSummaryQueries(db, month) {
 const start=month+'-01';
 const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10);
 const group='1,2,3,4,5,6';
 const leads=db.prepare(`SELECT ${crmSalesMarketFields('l.owner_id','l.business_scope')},
  COUNT(*) AS customers,COUNT(CASE WHEN l.grade='A' THEN 1 END) AS a_customers,
  COUNT(CASE WHEN l.last_contact<>'' THEN 1 END) AS contacted,
  COUNT(CASE WHEN COALESCE(${crmSalesReportDay('l.entered')},${crmSalesReportDay('l.created')})>=?
    AND COALESCE(${crmSalesReportDay('l.entered')},${crmSalesReportDay('l.created')})<? THEN 1 END) AS new_customers
  FROM crm_leads l JOIN crm_users u ON u.id=l.owner_id AND u.active=1
  WHERE ${crmReportCustomers}
  GROUP BY ${group}`).bind(start,end);
 const deals=db.prepare(`SELECT ${crmSalesMarketFields('d.owner_id',"COALESCE(NULLIF(d.business_scope,''),l.business_scope)")},
  w.currency,COUNT(*) AS orders,COUNT(w.total_minor) AS priced,SUM(w.total_minor) AS amount_minor
  FROM crm_deals d JOIN crm_leads l ON l.id=d.lead_id
  JOIN crm_users u ON u.id=d.owner_id AND u.active=1
  LEFT JOIN crm_workflow_contracts w ON w.deal_id=d.id
  WHERE d.cancelled=0 AND d.deal_date>=? AND d.deal_date<?
   AND l.channel<>'模拟流程演练'
  GROUP BY ${group},7`).bind(start,end);
 return [leads,deals];
}

function crmSalesMarket(row) {
 if(row.branch_owner||row.company)return 'foreign';
 if(row.market_tag==='内贸')return 'domestic';
 if(row.market_tag==='外贸'||row.business_scope==='alibaba'||/阿里|alibaba/i.test(row.source||''))return 'foreign';
 const country=crmCountryCode(row.country);
 if(country)return country==='CN'?'domestic':'foreign';
 return row.business_scope==='douyin-local'||/抖音|小红书|视频号/.test(row.source||'')?'domestic':'unclassified';
}

function crmSalesTotals(leads,deals) {
 const sales=Object.fromEntries(['domestic','foreign','unclassified'].map(scope=>[scope,{
  customers:0,a_customers:0,contacted:0,new_customers:0,orders:0,unverified_orders:0,contracts:[]
 }]));
 for(const row of leads){
  const scope=sales[crmSalesMarket(row)];
  for(const key of ['customers','a_customers','contacted','new_customers'])scope[key]+=row[key];
 }
 for(const row of deals){
  const market=crmSalesMarket(row),scope=sales[market];
  const expectedCurrency={domestic:'CNY',foreign:'USD'}[market];
  scope.orders+=row.orders;
  if(row.currency&&row.currency===expectedCurrency&&row.priced){
   scope.unverified_orders+=row.orders-row.priced;
   if(!scope.contracts.length)scope.contracts.push({currency:row.currency,amount_minor:0});
   scope.contracts[0].amount_minor+=row.amount_minor;
  }else scope.unverified_orders+=row.orders;
 }
 return sales;
}
