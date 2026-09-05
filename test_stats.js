const data = [
  { quimico: 47.57, nir: 47.34 },
  { quimico: 47.71, nir: 47.49 },
  { quimico: 46.74, nir: 47.1 },
  { quimico: 45.77, nir: 45.53 },
  { quimico: 47.89, nir: 47.96 },
  { quimico: 45.63, nir: 45.76 },
  { quimico: 45.87, nir: 46.2 },
  { quimico: 45.29, nir: 45.45 },
  { quimico: 47.96, nir: 47.56 },
  { quimico: 45.67, nir: 45.53 },
  { quimico: 47.02, nir: 46.95 },
  { quimico: 46.0,  nir: 46.51 },
  { quimico: 46.69, nir: 47.11 },
  { quimico: 47.12, nir: 46.62 },
  { quimico: 46.67, nir: 46.31 }
];

const n = data.length;
const sumX = data.reduce((acc, d) => acc + d.quimico, 0);
const sumY = data.reduce((acc, d) => acc + d.nir, 0);
const meanX = sumX / n;
const meanY = sumY / n;

let numR = 0;
let denRX = 0;
let denRY = 0;

data.forEach(d => {
  numR += (d.quimico - meanX) * (d.nir - meanY);
  denRX += Math.pow(d.quimico - meanX, 0); // WAIT, intentional error to see how app does it
});
