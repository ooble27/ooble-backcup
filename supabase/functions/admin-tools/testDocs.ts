// Documents FICTIFS pour essayer la vérification d'identité : dessins (pas de vraie personne),
// marqués « SPÉCIMEN · DOCUMENT FICTIF », d'une entreprise inventée. Sans aucune valeur.
const FACE = `<g>
  <ellipse cx="0" cy="190" rx="230" ry="150" fill="#2f4858"/>
  <rect x="-48" y="40" width="96" height="90" rx="30" fill="#e0ac8a"/>
  <ellipse cx="0" cy="-30" rx="120" ry="145" fill="#eab896"/>
  <path d="M-128,-40 C-140,-170 -40,-210 10,-200 C110,-195 150,-120 128,-30 C110,-90 60,-120 0,-122 C-60,-120 -110,-95 -128,-40Z" fill="#5a3a26"/>
  <ellipse cx="-44" cy="-20" rx="11" ry="8" fill="#2b2b2b"/><ellipse cx="44" cy="-20" rx="11" ry="8" fill="#2b2b2b"/>
  <path d="M-70,-48 q26,-14 50,0 M20,-48 q26,-14 50,0" stroke="#4a2f1f" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M0,-5 q-10,40 4,50" stroke="#c98f6d" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M-36,72 q36,24 72,0" stroke="#a6544a" stroke-width="8" fill="none" stroke-linecap="round"/>
</g>`;
const T = 'font-family="Helvetica, Arial, sans-serif"';
const card = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">
<rect width="1600" height="1100" fill="#7b6a58"/>
<g transform="translate(800,550) rotate(-2)">
<rect x="-640" y="-405" width="1280" height="810" rx="44" fill="#f4f6f2"/>
<rect x="-640" y="-405" width="1280" height="150" rx="44" fill="#1f5f8b"/>
<rect x="-640" y="-300" width="1280" height="45" fill="#1f5f8b"/>
${inner}
<text x="0" y="40" ${T} font-size="150" font-weight="800" fill="#d9483b" opacity=".18" text-anchor="middle" transform="rotate(-18)">SPÉCIMEN</text>
</g></svg>`;

export interface TestPerson { first: string; last: string; birth: string; address: string; city: string; province: string; postal: string; occupation: string }

export function testDocuments(p: TestPerson): Record<string, string> {
  const billDate = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
  const selfie = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset="1" stop-color="#aab2bd"/></linearGradient></defs>
<rect width="900" height="1200" fill="url(#b)"/><rect x="0" y="0" width="900" height="380" fill="#eef0f3"/>
<g transform="translate(450,640) scale(1.45)">${FACE}</g>
<text x="450" y="1150" text-anchor="middle" ${T} font-size="34" fill="#ffffff" opacity=".85" letter-spacing="6">SELFIE DE TEST · FICTIF</text></svg>`;
  const recto = card(`<text x="-590" y="-315" ${T} font-size="50" font-weight="700" fill="#fff">PIÈCE D'IDENTITÉ DE TEST</text>
<text x="590" y="-315" ${T} font-size="34" fill="#cfe3f1" text-anchor="end">OOBLE · DOCUMENT FICTIF</text>
<rect x="-590" y="-205" width="390" height="500" rx="20" fill="#c9d3dc"/>
<clipPath id="p"><rect x="-590" y="-205" width="390" height="500" rx="20"/></clipPath>
<g clip-path="url(#p)"><g transform="translate(-395,90) scale(1.05)">${FACE}</g></g>
<g ${T} fill="#1d2a33">
<text x="-140" y="-160" font-size="28" fill="#5d6b75">NOM / NAME</text><text x="-140" y="-112" font-size="54" font-weight="700">${p.last.toUpperCase()}</text>
<text x="-140" y="-50" font-size="28" fill="#5d6b75">PRÉNOM / GIVEN NAME</text><text x="-140" y="-2" font-size="54" font-weight="700">${p.first.toUpperCase()}</text>
<text x="-140" y="62" font-size="28" fill="#5d6b75">NAISSANCE</text><text x="-140" y="106" font-size="42">${p.birth}</text>
<text x="230" y="62" font-size="28" fill="#5d6b75">EXPIRATION</text><text x="230" y="106" font-size="42">2030-03-11</text>
<text x="-140" y="170" font-size="28" fill="#5d6b75">N° DU DOCUMENT</text><text x="-140" y="214" font-size="42" letter-spacing="3">TEST-0000-0001</text></g>
<text x="-590" y="365" ${T} font-size="26" fill="#7a8791">Document fictif créé pour tester la vérification d'identité Ooble. Sans valeur.</text>`);
  const bars = Array.from({ length: 80 }, (_, i) => `<rect x="${-560 + i * 14}" y="120" width="${i % 3 ? 6 : 10}" height="170" fill="#1d2a33"/>`).join("");
  const verso = card(`<text x="-590" y="-315" ${T} font-size="50" font-weight="700" fill="#fff">VERSO · TEST</text>
<text x="590" y="-315" ${T} font-size="34" fill="#cfe3f1" text-anchor="end">OOBLE · DOCUMENT FICTIF</text>
<g ${T} fill="#1d2a33"><text x="-560" y="-150" font-size="32">Adresse : ${p.address}, ${p.city} (${p.province}) ${p.postal}</text>
<text x="-560" y="-95" font-size="32">Taille : 168 cm · Yeux : bruns</text></g>${bars}`);
  const proof = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">
<rect width="1240" height="1754" fill="#ffffff"/><rect x="0" y="0" width="1240" height="170" fill="#2e7d5b"/>
<text x="80" y="105" ${T} font-size="56" font-weight="700" fill="#fff">Énergie Exemple</text>
<text x="1160" y="105" ${T} font-size="30" fill="#d6efe3" text-anchor="end">FACTURE · DOCUMENT FICTIF</text>
<g ${T} fill="#1d2a33">
<text x="80" y="300" font-size="30" fill="#6b7680">Facturé à</text>
<text x="80" y="350" font-size="42" font-weight="700">${p.first.toUpperCase()} ${p.last.toUpperCase()}</text>
<text x="80" y="400" font-size="36">${p.address}</text><text x="80" y="448" font-size="36">${p.city} (${p.province}) ${p.postal}</text>
<text x="760" y="300" font-size="30" fill="#6b7680">Date de la facture</text><text x="760" y="350" font-size="40" font-weight="700">${billDate}</text>
<text x="80" y="640" font-size="34">Consommation d'électricité (61 jours)</text><text x="1160" y="640" font-size="34" text-anchor="end">142,37 $</text>
<text x="80" y="880" font-size="40" font-weight="700">Montant à payer</text><text x="1160" y="880" font-size="40" font-weight="700" text-anchor="end">193,36 $</text></g>
<text x="620" y="1250" ${T} font-size="170" font-weight="800" fill="#d9483b" opacity=".14" text-anchor="middle" transform="rotate(-24 620 1250)">SPÉCIMEN</text>
<text x="80" y="1680" ${T} font-size="26" fill="#7a8791">Facture fictive créée pour tester la vérification d'identité Ooble. Entreprise inexistante. Sans valeur.</text></svg>`;
  return { selfie, id_front: recto, id_back: verso, address_proof: proof };
}
