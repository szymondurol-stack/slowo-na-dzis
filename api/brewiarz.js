const cheerio = require("cheerio");

const ROMAN = ["i","ii","iii","iv","v","vi","vii","viii","ix","x","xi","xii"];

function clean(s=""){
  return s.replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
}

function abs(base, href){
  try { return new URL(href, base).toString(); } catch { return null; }
}

function localPenalty(text){
  const patterns = [
    /W diecezji/i, /W archidiecezji/i, /W zakonie/i, /W zgromadzeniu/i,
    /W zgromadzeniach/i, /W opactwie/i, /W klasztorze/i, /W parafii/i,
    /W bazylice/i, /W seminarium/i
  ];
  return patterns.reduce((n,re)=>n+(re.test(text)?8:0),0);
}

function rankPage(text, folder, isSunday){
  let score=0;
  if(/Niedziela/i.test(text)) score+=isSunday?12:2;
  if(/UROCZYSTOŚĆ/i.test(text)) score+=7;
  if(/ŚWIĘTO/i.test(text)) score+=6;
  if(/Wspomnienie obowiązkowe/i.test(text)) score+=4;
  if(/Wspomnienie dowolne/i.test(text)) score+=1;
  score-=localPenalty(text);

  // "p" is usually the general weekday page; no suffix is common on Sundays.
  if(folder.endsWith("p")) score+=isSunday?0:3;
  if(!/[a-z]|\d$/.test(folder.slice(4))) score+=isSunday?5:0;
  return score;
}

async function fetchText(url){
  const r=await fetch(url,{
    headers:{
      "user-agent":"SlowoNaDzis/1.1 (+https://wroclawwielbi.pl/)",
      "accept-language":"pl-PL,pl;q=0.9"
    },
    redirect:"follow"
  });
  if(!r.ok) return null;
  return { url:r.url, text:await r.text() };
}

function extractOfficeLinks(pageUrl, html){
  const $=cheerio.load(html);
  let jutrznia=null, nieszpory=null;
  $("a").each((_,a)=>{
    const t=clean($(a).text());
    const href=$(a).attr("href");
    if(!href) return;
    if(!jutrznia && /^Jutrznia$/i.test(t) && !/osb/i.test(href)) jutrznia=abs(pageUrl,href);
    if(!nieszpory && /^(I |II )?Nieszpory$/i.test(t) && !/osb/i.test(href)) nieszpory=abs(pageUrl,href);
  });

  // Fallback: office filenames are stable once the right daily directory is known.
  const base=pageUrl.replace(/index\.php3.*$/i,"");
  if(!jutrznia) jutrznia=base+"jutrznia.php3";
  if(!nieszpory) nieszpory=base+"nieszpory.php3";

  const text=clean($("body").text());
  let celebration="";
  const colorIx=text.search(/Kolor szat:/i);
  if(colorIx>=0){
    celebration=text.slice(colorIx).replace(/^Kolor szat:\s*/i,"").split(/Jutrznia|Teksty LG|Garść informacji/i)[0].trim();
    celebration=celebration.slice(0,220);
  }

  let morningTitle="Czytaj Jutrznię";
  let eveningTitle="Czytaj Nieszpory";
  if(/\bII Nieszpory\b/i.test(text)) eveningTitle="Czytaj II Nieszpory";
  else if(/\bI Nieszpory\b/i.test(text)) eveningTitle="Czytaj I Nieszpory";

  return {jutrznia,nieszpory,celebration,morningTitle,eveningTitle,text};
}

module.exports=async function handler(req,res){
  const date=String(req.query?.date||"");
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if(!m) return res.status(400).json({error:"Nieprawidłowa data. Użyj YYYY-MM-DD."});

  const year=+m[1], month=+m[2], day=+m[3];
  const d=new Date(year,month-1,day,12);
  const isSunday=d.getDay()===0;
  const yy=String(year).slice(-2);
  const dd=String(day).padStart(2,"0");
  const mm=String(month).padStart(2,"0");
  const prefix=dd+mm;
  const monthRoot=`https://www.brewiarz.pl/${ROMAN[month-1]}_${yy}/`;
  const monthIndex=monthRoot+"index.html";

  try{
    let folders=[];

    // First learn the day's available variants from the monthly index.
    const monthly=await fetchText(monthIndex);
    if(monthly){
      const $=cheerio.load(monthly.text);
      $("a[href]").each((_,a)=>{
        const href=$(a).attr("href")||"";
        const match=href.match(new RegExp(`(?:^|/)(${prefix}(?:p|w\\d+)?)\\/index\\.php3`,"i"));
        if(match) folders.push(match[1]);
      });
    }

    // Stable fallbacks if the monthly index layout changes.
    folders=[...new Set([
      ...folders,
      prefix,
      prefix+"p",
      ...Array.from({length:9},(_,i)=>prefix+"w"+(i+1))
    ])];

    const candidates=[];
    for(const folder of folders){
      const page=await fetchText(`${monthRoot}${folder}/index.php3`);
      if(!page) continue;

      const expectedDate=`${dd}.${mm}.${year}`;
      const bodyText=clean(cheerio.load(page.text)("body").text());
      if(!bodyText.includes(expectedDate)) continue;
      if(!/Jutrznia/i.test(bodyText) || !/Nieszpory/i.test(bodyText)) continue;

      const offices=extractOfficeLinks(page.url,page.text);
      candidates.push({
        folder,
        score:rankPage(offices.text,folder,isSunday),
        ...offices
      });
    }

    if(!candidates.length){
      return res.status(404).json({
        error:"Nie znaleziono Liturgii Godzin dla wskazanej daty.",
        home:"https://brewiarz.pl/"
      });
    }

    candidates.sort((a,b)=>b.score-a.score);
    const best=candidates[0];

    res.setHeader("Cache-Control","s-maxage=43200, stale-while-revalidate=86400");
    return res.status(200).json({
      date,
      celebration:best.celebration,
      jutrznia:best.jutrznia,
      nieszpory:best.nieszpory,
      morningTitle:best.morningTitle,
      eveningTitle:best.eveningTitle,
      source:"https://brewiarz.pl/"
    });
  }catch(e){
    return res.status(500).json({
      error:"Nie udało się odnaleźć odnośników do Brewiarza.",
      detail:e.message,
      home:"https://brewiarz.pl/"
    });
  }
};
