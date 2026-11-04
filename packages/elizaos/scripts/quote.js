import { createBriefClient } from '../src/client.js';
const quote = await createBriefClient().quote();
console.log(JSON.stringify({ unpaidQuoteOnly: true, realPaidCall: false, quote }, null, 2));
