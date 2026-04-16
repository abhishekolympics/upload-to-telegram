const data = JSON.parse(require('fs').readFileSync('uploaded.json'));
const trips = {};
for (const [key, val] of Object.entries(data)) {
  const trip = key.split('::')[0];
  if (!trips[trip]) trips[trip] = { size: 0, count: 0 };
  trips[trip].size += val.size || 0;
  trips[trip].count++;
}
for (const [trip, info] of Object.entries(trips)) {
  console.log(trip + ':', (info.size / 1024**3).toFixed(2), 'GB,', info.count, 'parts');
}
