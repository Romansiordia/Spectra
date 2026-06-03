import { convert } from 'jcampconverter';

const jcampString = `##TITLE= Pollo Inicio Entero
##JCAMP-DX= 4.24
##DATA TYPE= INFRARED SPECTRUM
##XUNITS= NANOMETERS
##YUNITS= ABSORBANCE
##FIRSTX= 850
##LASTX= 851.5
##NPOINTS= 4
##DELTAX= 0.5
##YFACTOR= 1
##XYDATA= (X++(Y..Y))
850 a175A2nB5nB7n
##END=`;

const result = convert(jcampString, { keepRecordsRegExp: /.*/ });
console.log(JSON.stringify(result.flatten[0].spectra[0].data, null, 2));
