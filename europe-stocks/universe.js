// Curated starting universe, not an index membership or broker availability claim.
(function (g) {
  'use strict';
  const markets = {
    DE: {name:'Germania',suffix:'DE',exchange:'Xetra',currency:'EUR',benchmark:'^GDAXI',index:'DAX'},
    FR: {name:'Franța',suffix:'PA',exchange:'Paris',currency:'EUR',benchmark:'^FCHI',index:'CAC 40'},
    NL: {name:'Olanda',suffix:'AS',exchange:'Amsterdam',currency:'EUR',benchmark:'^AEX',index:'AEX'},
    IT: {name:'Italia',suffix:'MI',exchange:'Milano',currency:'EUR',benchmark:'FTSEMIB.MI',index:'FTSE MIB'},
    ES: {name:'Spania',suffix:'MC',exchange:'Madrid',currency:'EUR',benchmark:'^IBEX',index:'IBEX 35'},
    UK: {name:'Regatul Unit',suffix:'L',exchange:'Londra',currency:'GBP',benchmark:'^FTSE',index:'FTSE 100'},
    CH: {name:'Elveția',suffix:'SW',exchange:'SIX',currency:'CHF',benchmark:'^SSMI',index:'SMI'},
    DK: {name:'Danemarca',suffix:'CO',exchange:'Copenhaga',currency:'DKK',benchmark:'^OMXC25',index:'OMX C25'},
    SE: {name:'Suedia',suffix:'ST',exchange:'Stockholm',currency:'SEK',benchmark:'^OMX',index:'OMX S30'},
    FI: {name:'Finlanda',suffix:'HE',exchange:'Helsinki',currency:'EUR',benchmark:'^OMXH25',index:'OMX H25'},
    BE: {name:'Belgia',suffix:'BR',exchange:'Bruxelles',currency:'EUR',benchmark:'^BFX',index:'BEL 20'}
  };
  const groups = {
    DE: [
      ['SAP','SAP','Tehnologie'],['RHM','Rheinmetall','Industriale'],['SIE','Siemens','Industriale'],
      ['IFX','Infineon','Tehnologie'],['ADS','Adidas','Consum discreționar'],['ALV','Allianz','Financiare'],
      ['DTE','Deutsche Telekom','Comunicații'],['BAS','BASF','Materiale'],['BAYN','Bayer','Sănătate'],
      ['MBG','Mercedes-Benz','Consum discreționar'],['VOW3','Volkswagen','Consum discreționar'],
      ['BMW','BMW','Consum discreționar'],['DBK','Deutsche Bank','Financiare'],['CBK','Commerzbank','Financiare'],
      ['MTX','MTU Aero Engines','Industriale'],['HEN3','Henkel','Consum de bază'],['HEI','Heidelberg Materials','Materiale'],
      ['ENR','Siemens Energy','Industriale'],['P911','Porsche','Consum discreționar']
    ],
    FR: [
      ['AIR','Airbus','Industriale'],['SU','Schneider Electric','Industriale'],['MC','LVMH','Consum discreționar'],
      ['OR','L’Oréal','Consum de bază'],['TTE','TotalEnergies','Energie'],['SAF','Safran','Industriale'],
      ['BNP','BNP Paribas','Financiare'],['STMPA','STMicroelectronics','Tehnologie'],['SAN','Sanofi','Sănătate'],
      ['HO','Thales','Industriale'],['RNO','Renault','Consum discreționar'],['KER','Kering','Consum discreționar']
    ],
    NL: [
      ['ASML','ASML','Tehnologie'],['ASM','ASM International','Tehnologie'],['BESI','BE Semiconductor','Tehnologie'],
      ['ADYEN','Adyen','Financiare'],['PRX','Prosus','Consum discreționar'],['INGA','ING','Financiare'],['PHIA','Philips','Sănătate']
    ],
    IT: [['LDO','Leonardo','Industriale'],['UCG','UniCredit','Financiare'],['ISP','Intesa Sanpaolo','Financiare'],
      ['ENEL','Enel','Utilități'],['ENI','Eni','Energie'],['RACE','Ferrari','Consum discreționar']],
    ES: [['SAN','Santander','Financiare'],['BBVA','BBVA','Financiare'],['IBE','Iberdrola','Utilități'],['ITX','Inditex','Consum discreționar']],
    UK: [['SHEL','Shell','Energie'],['AZN','AstraZeneca','Sănătate'],['HSBA','HSBC','Financiare'],
      ['RR','Rolls-Royce','Industriale'],['LSEG','London Stock Exchange','Financiare'],['BARC','Barclays','Financiare'],
      ['BP','BP','Energie'],['GSK','GSK','Sănătate']],
    CH: [['NESN','Nestlé','Consum de bază'],['NOVN','Novartis','Sănătate'],['ROP','Roche','Sănătate'],
      ['ABBN','ABB','Industriale'],['UBSG','UBS','Financiare']],
    DK: [['NOVO-B','Novo Nordisk','Sănătate'],['DSV','DSV','Industriale'],['VWS','Vestas','Industriale']],
    SE: [['VOLV-B','Volvo','Industriale'],['SAAB-B','Saab','Industriale'],['ERIC-B','Ericsson','Tehnologie'],['ATCO-A','Atlas Copco','Industriale']],
    FI: [['NOKIA','Nokia','Tehnologie'],['NESTE','Neste','Energie']],
    BE: [['UCB','UCB','Sănătate'],['ABI','AB InBev','Consum de bază']]
  };
  const stocks = Object.entries(groups).flatMap(([market,rows]) => rows.map(([ticker,name,sector]) => ({
    symbol:ticker+'.'+markets[market].suffix, name, sector, market
  })));
  const bySymbol = new Map(stocks.map(x => [x.symbol,x]));
  function describe(symbol) {
    if (typeof symbol !== 'string' || !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) return null;
    const known = bySymbol.get(symbol);
    const market = known?.market || Object.keys(markets).find(k => symbol.endsWith('.'+markets[k].suffix));
    return market ? {...markets[market],...(known || {symbol,name:symbol,sector:'Necunoscut',market}),country:markets[market].name,market} : null;
  }
  function list(market='all',watchlist=[],watchlistOnly=false) {
    const symbols = [...new Set((watchlistOnly ? [] : stocks.map(x => x.symbol)).concat(watchlist))];
    return symbols.map(describe).filter(x => x && (market==='all' || x.market===market));
  }
  g.EuropeUniverse = {markets,stocks,describe,list};
})(typeof window!=='undefined'?window:globalThis);
