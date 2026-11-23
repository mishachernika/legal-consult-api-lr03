import 'dotenv/config';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/utils/password.js';

// Демо-пароль для всіх сідів-акаунтів (лише для локальної розробки!)
const DEMO_PASSWORD = 'password123';

async function main() {
  // очищаємо таблиці у порядку, що не порушує зовнішні ключі
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.file.deleteMany();
  await prisma.review.deleteMany();
  await prisma.message.deleteMany();
  await prisma.consultation.deleteMany();
  await prisma.lawyerProfile.deleteMany();
  await prisma.specialization.deleteMany();
  await prisma.user.deleteMany();

  const password = await hashPassword(DEMO_PASSWORD);

  const specializationsData = [
    { name: 'Цивільне право', description: 'Договори, нерухомість, відшкодування шкоди, спадщина' },
    { name: 'Кримінальне право', description: 'Захист у кримінальних провадженнях, скарги на дії слідства' },
    { name: 'Сімейне право', description: 'Розірвання шлюбу, аліменти, поділ майна, опіка над дитиною' },
    { name: 'Господарське право', description: 'Господарські спори, договори між підприємствами, банкрутство' },
    { name: 'Трудове право', description: 'Звільнення, невиплата зарплати, трудові договори' },
    { name: 'Податкове право', description: 'Податкові перевірки, оскарження рішень ДПС, податкові спори' },
  ];
  const specs = [];
  for (const s of specializationsData) {
    specs.push(await prisma.specialization.create({ data: s }));
  }

  const admin = await prisma.user.create({
    data: { email: 'admin@legal.ua', password, name: 'Адміністратор платформи', role: 'ADMIN' },
  });

  const lawyersData = [
    {
      email: 'ivan.petrenko@legal.ua',
      name: 'Петренко Іван Олексійович',
      phone: '+380671112233',
      bio: 'Адвокат, 12 років практики. Спеціалізація на нерухомості та договірному праві.',
      experienceYears: 12,
      pricePerHour: 900,
      specIdx: [0, 3],
    },
    {
      email: 'olena.shevchenko@legal.ua',
      name: 'Шевченко Олена Петрівна',
      phone: '+380672223344',
      bio: 'Юрист із сімейних спорів, медіатор. Допомагаю мирно врегулювати конфлікти.',
      experienceYears: 8,
      pricePerHour: 700,
      specIdx: [2],
    },
    {
      email: 'andriy.kravchuk@legal.ua',
      name: 'Кравчук Андрій Миколайович',
      phone: '+380673334455',
      bio: 'Кримінальний адвокат, захист на досудовому слідстві та в суді.',
      experienceYears: 15,
      pricePerHour: 1200,
      specIdx: [1],
    },
  ];

  const lawyerProfiles = [];
  for (const l of lawyersData) {
    const user = await prisma.user.create({
      data: { email: l.email, password, name: l.name, phone: l.phone, role: 'LAWYER' },
    });
    const profile = await prisma.lawyerProfile.create({
      data: {
        userId: user.id,
        bio: l.bio,
        experienceYears: l.experienceYears,
        pricePerHour: l.pricePerHour,
        isVerified: true,
        specializations: { connect: l.specIdx.map((i) => ({ id: specs[i].id })) },
      },
    });
    lawyerProfiles.push({ user, profile });
  }

  const clientsData = [
    { email: 'olena.kovalchuk@example.com', name: 'Ковальчук Олена Іванівна', phone: '+380501112233' },
    { email: 'taras.bondar@example.com', name: 'Бондар Тарас Романович', phone: '+380502223344' },
    { email: 'maria.grytsay@example.com', name: 'Грицай Марія Степанівна', phone: '+380503334455' },
  ];
  const clients = [];
  for (const c of clientsData) {
    clients.push(await prisma.user.create({ data: { ...c, password, role: 'CLIENT' } }));
  }

  const consultationsData = [
    {
      client: clients[0],
      lawyer: lawyerProfiles[0],
      topic: 'Договір купівлі квартири',
      description: 'Потрібно перевірити договір купівлі-продажу квартири та оцінити ризики для покупця.',
      status: 'COMPLETED',
      scheduledAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
    },
    {
      client: clients[0],
      lawyer: lawyerProfiles[1],
      topic: 'Розірвання шлюбу та поділ майна',
      description: 'Допомога з оформленням розірвання шлюбу і мирним поділом спільного майна подружжя.',
      status: 'CONFIRMED',
      scheduledAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    },
    {
      client: clients[1],
      lawyer: lawyerProfiles[2],
      topic: 'Скарга на постанову слідчого',
      description: 'Прошу підготувати скаргу на постанову про повідомлення про підозру.',
      status: 'IN_PROGRESS',
      scheduledAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
    },
    {
      client: clients[2],
      lawyer: lawyerProfiles[0],
      topic: 'Трудовий спір щодо незаконного звільнення',
      description: 'Роботодавець звільнив без попередження та не виплатив зарплату за останній місяць.',
      status: 'PENDING',
    },
  ];

  const consultations = [];
  for (const c of consultationsData) {
    consultations.push(
      await prisma.consultation.create({
        data: {
          clientId: c.client.id,
          lawyerId: c.lawyer.user.id,
          topic: c.topic,
          description: c.description,
          status: c.status,
          scheduledAt: c.scheduledAt,
          price: c.lawyer.profile.pricePerHour,
        },
      })
    );
  }

  // чат у завершеній консультації
  await prisma.message.createMany({
    data: [
      { consultationId: consultations[0].id, senderId: consultations[0].clientId, text: 'Добрий день! Надсилаю проєкт договору на перевірку.' },
      { consultationId: consultations[0].id, senderId: consultations[0].lawyerId, text: 'Добрий день! Перевірив: є ризик із заборгованістю продавця за комуналку. Рекомендую додати пункт про утримання коштів.' },
      { consultationId: consultations[0].id, senderId: consultations[0].clientId, text: 'Дякую, внесу правку і підпишемо договір.' },
    ],
  });

  // відгук на завершену консультацію + рейтинг юриста
  await prisma.review.create({
    data: {
      consultationId: consultations[0].id,
      clientId: consultations[0].clientId,
      lawyerId: consultations[0].lawyerId,
      rating: 5,
      text: 'Дуже вдячна за детальну консультацію, всі ризики пояснили зрозуміло.',
    },
  });
  await prisma.lawyerProfile.update({
    where: { id: lawyerProfiles[0].profile.id },
    data: { rating: 5 },
  });

  console.log('Seed завершено:');
  console.log(`- спеціалізацій: ${specs.length}`);
  console.log(`- користувачів: ${1 + lawyerProfiles.length + clients.length}`);
  console.log(`- профілів юристів: ${lawyerProfiles.length}`);
  console.log(`- консультацій: ${consultations.length}`);
  console.log('\nДемо-акаунти (пароль для всіх: ' + DEMO_PASSWORD + '):');
  console.log(`- адмін:    ${admin.email}`);
  for (const l of lawyerProfiles) console.log(`- юрист:    ${l.user.email}`);
  for (const c of clients) console.log(`- клієнт:   ${c.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
