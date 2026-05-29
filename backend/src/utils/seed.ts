import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

async function seed() {
  console.log('🌱 Seedowanie bazy danych...');

  // Użytkownik demo
  const hash = await bcrypt.hash('demo1234', 12);
  const user = await prisma.user.upsert({
    where: { email: 'demo@minibaselinker.pl' },
    update: {},
    create: {
      email: 'demo@minibaselinker.pl',
      password: hash,
      name: 'Demo Admin',
      role: 'admin',
    },
  });
  console.log('✅ Użytkownik:', user.email);

  // Przykładowa część
  const part = await prisma.part.create({
    data: {
      name: 'Tarcza hamulcowa przednia MAN TGX',
      oemNumber: '81508030068',
      catalogNumber: 'THM-001',
      ean: '5901234123457',
      category: 'hamulce',
      subcategory: 'tarcze',
      condition: 'NEW',
      priceNet: 350.00,
      priceBrutto: 430.50,
      vatRate: 23,
      stock: 15,
      descriptionShort: 'Tarcza hamulcowa osi przedniej MAN TGX, średnica 430mm',
      descriptionLong: `<h3>Tarcza hamulcowa przednia MAN TGX</h3>
<p>Fabrycznie nowa tarcza hamulcowa osi przedniej do pojazdów MAN serii TGX/TGS/TGM.</p>
<ul>
  <li>Średnica: 430 mm</li>
  <li>Grubość nominalna: 45 mm</li>
  <li>Grubość minimalna: 41 mm</li>
  <li>Ilość otworów: 10</li>
</ul>`,
      technicalParams: JSON.stringify({
        srednica: '430 mm',
        grubosc_nominalna: '45 mm',
        grubosc_minimalna: '41 mm',
        ilosc_otworow: '10',
        material: 'Żeliwo szare',
      }),
      userId: user.id,
    },
  });

  // Kompatybilność
  await prisma.compatibility.createMany({
    data: [
      { partId: part.id, brand: 'MAN', series: 'TGX', model: 'TGX 18.400', yearFrom: 2007, yearTo: 2020 },
      { partId: part.id, brand: 'MAN', series: 'TGS', model: 'TGS 18.360', yearFrom: 2007, yearTo: 2020 },
      { partId: part.id, brand: 'MAN', series: 'TGM', model: 'TGM 15.250', yearFrom: 2008, yearTo: 2020 },
    ],
  });

  // Szablony
  await prisma.template.createMany({
    data: [
      {
        name: 'Allegro – Części ciężarowe standard',
        portal: 'ALLEGRO',
        isDefault: true,
        userId: user.id,
        fieldMapping: JSON.stringify({
          title: '{{name}} OEM:{{oemNumber}} – {{condition}}',
          description: '{{descriptionLong}}',
          price: 'priceBrutto',
          quantity: 'stock',
          ean: 'ean',
        }),
        portalConfig: JSON.stringify({
          categoryId: '257517',
          deliveryOptions: ['INPOST', 'DPD'],
          duration: 30,
          location: 'Warszawa',
        }),
      },
      {
        name: 'Otomoto – Części standard',
        portal: 'OTOMOTO',
        isDefault: true,
        userId: user.id,
        fieldMapping: JSON.stringify({
          title: '{{name}}',
          price: 'priceNet',
          description: '{{descriptionShort}}\n\n{{descriptionLong}}',
        }),
        portalConfig: JSON.stringify({
          region: 'mazowieckie',
          city: 'Warszawa',
        }),
      },
      {
        name: 'Autoline – Import CSV',
        portal: 'AUTOLINE',
        isDefault: true,
        userId: user.id,
        fieldMapping: JSON.stringify({
          article_name: '{{name}}',
          oem: 'oemNumber',
          price: 'priceNet',
          quantity: 'stock',
          description: 'descriptionShort',
        }),
        portalConfig: JSON.stringify({
          currency: 'PLN',
          country: 'PL',
        }),
      },
    ],
  });

  console.log('✅ Seed zakończony!');
  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
