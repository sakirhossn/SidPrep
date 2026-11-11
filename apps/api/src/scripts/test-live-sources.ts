import { testFeedConnectivity } from '../services/newsIngestion.js';

interface SourceTestTarget {
  name: string;
  url: string;
  group: string;
}

const TARGETS: SourceTestTarget[] = [
  {
    name: 'Press Information Bureau (PIB) Main',
    url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
    group: 'national_governance',
  },
  {
    name: 'Reserve Bank of India (RBI)',
    url: 'https://rbi.org.in/pressreleases_rss.xml',
    group: 'economy_banking',
  },
  {
    name: 'DD News National',
    url: 'https://ddnews.gov.in/en/category/national/feed/',
    group: 'national_governance',
  },
  {
    name: 'The Hindu National News',
    url: 'https://www.thehindu.com/news/national/feeder/default.rss',
    group: 'national_governance',
  },
  {
    name: 'Google News Discovery: National & Governance',
    url: 'https://news.google.com/rss/search?q=(Cabinet+decision+OR+PIB+OR+%22government+scheme%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    group: 'national_governance',
  },
  {
    name: 'Google News Discovery: Defence & Science',
    url: 'https://news.google.com/rss/search?q=(ISRO+OR+DRDO+OR+missile+OR+%22military+exercise%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    group: 'defence_sci_tech',
  },
  {
    name: 'Google News Discovery: Sports',
    url: 'https://news.google.com/rss/search?q=(%22championship+win%22+OR+%22Olympic+gold%22+OR+%22Asian+Games%22+OR+%22World+Cup%22)+when:1d&hl=en-IN&gl=IN&ceid=IN:en',
    group: 'sports',
  },
];

async function runLiveTests() {
  console.log('=== LIVE SOURCE CONNECTIVITY AND PARSING AUDIT ===\n');
  const results = [];

  for (const target of TARGETS) {
    const start = Date.now();
    try {
      const res = await testFeedConnectivity(target.url);
      const latencyMs = Date.now() - start;

      results.push({
        name: target.name,
        group: target.group,
        url: target.url,
        latencyMs,
        httpStatus: res.httpStatus,
        detectedFormat: res.detectedFormat,
        success: res.success,
        itemCount: res.itemCount,
        sample: res.sampleEntries?.[0]?.headline || 'None',
        error: res.error || null,
      });

      console.log(`[${res.success ? 'PASS' : 'WARN/FAIL'}] ${target.name} (${latencyMs}ms)`);
      console.log(`  Status: ${res.httpStatus} | Format: ${res.detectedFormat} | Items: ${res.itemCount}`);
      if (res.sampleEntries?.length > 0) {
        console.log(`  Sample 1: "${res.sampleEntries[0].headline}"`);
      }
      if (res.error) {
        console.log(`  Note/Error: ${res.error}`);
      }
      console.log('');
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      results.push({
        name: target.name,
        group: target.group,
        url: target.url,
        latencyMs,
        httpStatus: 0,
        detectedFormat: 'UNKNOWN',
        success: false,
        itemCount: 0,
        sample: 'None',
        error: err.message,
      });
      console.log(`[FAIL] ${target.name} (${latencyMs}ms): ${err.message}\n`);
    }
  }

  console.log('=== LIVE AUDIT COMPLETE ===');
}

runLiveTests();
