import express from 'express';
import {readFileSync} from 'fs';

const port = readFileSync('port.txt').toString();
if (!port) {
  throw new Error('You have to pass port');
}
const app = express();

app.use((req, res) => {
  res.send('Waiting for the actual app to be finally deployed. This is dummy.');
});
app.listen(port, () => {
  console.log(`Dummy image: listening on port ${port}`);
});
