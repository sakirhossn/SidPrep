import { db } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { closePool } from '../db/pool.js';
import { generateTotpSecret } from '../lib/security.js';

export async function seedDatabase(targetDb = db) {
  console.log('[Seed] Ensuring migrations are applied before seeding...');
  await runMigrations();
  await targetDb.init();

  console.log('[Seed] Admin accounts are not automatically seeded for security. Run pnpm bootstrap:admin to create the root administrator.');

  console.log('[Seed] Seeding official exams...');
  targetDb.exams.set('ssc-cgl', {
    id: 'ssc-cgl',
    bodyCode: 'SSC',
    code: 'SSC_CGL',
    name: 'SSC Combined Graduate Level (CGL)',
    description: 'Official Tier 1 & Tier 2 examination pattern for Central Government Group B and C posts.',
    stagesCount: 2,
    verifiedDate: '2026-09-15',
    sourceUrl: 'https://ssc.gov.in/notice-cgl-2026',
    stages: [
      {
        id: 'cgl-tier-1',
        name: 'Tier-I (Computer Based Examination)',
        stageNumber: 1,
        durationMinutes: 60,
        totalMarks: 200,
        negativeMarkRatio: 0.5,
        sectionLock: false,
      },
      {
        id: 'cgl-tier-2',
        name: 'Tier-II (Paper-I Mathematical & Reasoning + English & GK)',
        stageNumber: 2,
        durationMinutes: 135,
        totalMarks: 390,
        negativeMarkRatio: 1.0,
        sectionLock: true,
      },
    ],
    syllabusTree: [
      {
        subject: 'General Intelligence and Reasoning',
        weightPercentage: 25,
        topics: ['Analogies', 'Syllogism', 'Venn Diagrams', 'Blood Relations', 'Coding-Decoding', 'Series'],
      },
      {
        subject: 'General Awareness',
        weightPercentage: 25,
        topics: ['Indian Polity & Constitution', 'History & Culture', 'Economy & Budget', 'General Science', 'Current Affairs'],
      },
      {
        subject: 'Quantitative Aptitude',
        weightPercentage: 25,
        topics: ['Arithmetic', 'Algebra', 'Geometry & Mensuration', 'Trigonometry', 'Data Interpretation'],
      },
      {
        subject: 'English Comprehension',
        weightPercentage: 25,
        topics: ['Reading Comprehension', 'Error Spotting', 'Fill in the Blanks', 'Vocabulary & Synonyms', 'Active/Passive Voice'],
      },
    ],
  });

  targetDb.exams.set('rrb-ntpc', {
    id: 'rrb-ntpc',
    bodyCode: 'RRB',
    code: 'RRB_NTPC',
    name: 'RRB Non-Technical Popular Categories (NTPC)',
    description: 'Official Railway Recruitment Board exam for Graduate and Undergraduate posts.',
    stagesCount: 2,
    verifiedDate: '2026-08-20',
    sourceUrl: 'https://indianrailways.gov.in/rrb-ntpc-notice-2026',
    stages: [
      {
        id: 'ntpc-cbt-1',
        name: 'CBT-1 Screening',
        stageNumber: 1,
        durationMinutes: 90,
        totalMarks: 100,
        negativeMarkRatio: 0.33,
        sectionLock: false,
      },
    ],
    syllabusTree: [
      {
        subject: 'General Awareness (Science & Current Affairs)',
        weightPercentage: 40,
        topics: ['Current Events of National Importance', 'Indian Railways History & Stats', 'General Science', 'Indian Art & Culture'],
      },
      {
        subject: 'Mathematics',
        weightPercentage: 30,
        topics: ['Number System', 'Decimals & Fractions', 'LCM & HCF', 'Ratio & Proportion', 'Time & Work', 'Simple & Compound Interest'],
      },
      {
        subject: 'General Intelligence and Reasoning',
        weightPercentage: 30,
        topics: ['Analogies', 'Data Sufficiency', 'Statement-Conclusion', 'Decision Making', 'Puzzles'],
      },
    ],
  });

  console.log('[Seed] Seeding questions...');
  targetDb.questions.set('q_1', {
    id: 'q_1',
    topicId: 'Indian Polity & Constitution',
    difficulty: 'EASY',
    pyqYear: 2024,
    pyqExam: 'SSC CGL Tier-1',
    pyqShift: 'Shift 2',
    correctOptionId: 'opt_b',
    createdBy: 'adm_1',
    status: 'PUBLISHED',
    translations: [
      {
        language: 'en',
        text: 'Under which Article of the Constitution of India is the Right to Equality before Law guaranteed?',
        explanation: 'Article 14 guarantees equality before the law and the equal protection of the laws within the territory of India.',
        options: [
          { id: 'opt_a', text: 'Article 19' },
          { id: 'opt_b', text: 'Article 14' },
          { id: 'opt_c', text: 'Article 21' },
          { id: 'opt_d', text: 'Article 32' },
        ],
      },
      {
        language: 'hi',
        text: 'भारतीय संविधान के किस अनुच्छेद के तहत कानून के समक्ष समानता की गारंटी दी गई है?',
        explanation: 'अनुच्छेद 14 कानून के समक्ष समानता और भारत के क्षेत्र में कानूनों के समान संरक्षण की गारंटी देता है।',
        options: [
          { id: 'opt_a', text: 'अनुच्छेद 19' },
          { id: 'opt_b', text: 'अनुच्छेद 14' },
          { id: 'opt_c', text: 'अनुच्छेद 21' },
          { id: 'opt_d', text: 'अनुच्छेद 32' },
        ],
      },
      {
        language: 'bn',
        text: 'ভারতের সংবিধানের কোন অনুচ্ছেদের অধীনে আইনের দৃষ্টিতে সমতার নিশ্চয়তা দেওয়া হয়েছে?',
        explanation: 'ধারা ১৪ ভারতের ভূখণ্ডে আইনের দৃষ্টিতে সমতা এবং আইনের সমান সুরক্ষার নিশ্চয়তা দেয়।',
        options: [
          { id: 'opt_a', text: 'অনুচ্ছেদ ১৯' },
          { id: 'opt_b', text: 'অনুচ্ছেদ ১৪' },
          { id: 'opt_c', text: 'অনুচ্ছেদ ২১' },
          { id: 'opt_d', text: 'অনুচ্ছেদ ৩২' },
        ],
      },
    ],
  });

  targetDb.questions.set('q_2', {
    id: 'q_2',
    topicId: 'Arithmetic',
    difficulty: 'MEDIUM',
    pyqYear: 2023,
    pyqExam: 'SSC CGL Tier-1',
    pyqShift: 'Shift 1',
    correctOptionId: 'opt_c',
    createdBy: 'adm_1',
    status: 'PUBLISHED',
    translations: [
      {
        language: 'en',
        text: 'A train 240 m in length crosses a telegraph post in 16 seconds. What is the speed of the train in km/h?',
        explanation: 'Speed = Distance / Time = 240 / 16 = 15 m/s. In km/h = 15 * (18 / 5) = 54 km/h.',
        options: [
          { id: 'opt_a', text: '48 km/h' },
          { id: 'opt_b', text: '60 km/h' },
          { id: 'opt_c', text: '54 km/h' },
          { id: 'opt_d', text: '72 km/h' },
        ],
      },
      {
        language: 'hi',
        text: '240 मीटर लंबी एक ट्रेन 16 सेकंड में एक टेलीग्राफ पोस्ट को पार करती है। ट्रेन की गति किमी/घंटा में क्या है?',
        explanation: 'गति = दूरी / समय = 240 / 16 = 15 मीटर/सेकंड। किमी/घंटा में = 15 * (18 / 5) = 54 किमी/घंटा।',
        options: [
          { id: 'opt_a', text: '48 किमी/घंटा' },
          { id: 'opt_b', text: '60 किमी/घंटा' },
          { id: 'opt_c', text: '54 किमी/घंटा' },
          { id: 'opt_d', text: '72 किमी/घंटा' },
        ],
      },
    ],
  });

  console.log('[Seed] Seeding tests...');
  targetDb.tests.set('test_cgl_full_01', {
    id: 'test_cgl_full_01',
    examCode: 'SSC_CGL',
    title: 'SSC CGL Tier-1 Full Mock Test #01 (2026 Scheme)',
    type: 'FULL',
    durationMinutes: 60,
    totalQuestions: 2,
    totalMarks: 4.0,
    isFree: true,
    isPublished: true,
    instructions: [
      'Each question carries 2.0 marks for correct answer.',
      'There is a penalty of 0.50 marks for each incorrect response.',
      'Total duration is 60 minutes with auto-submission.',
    ],
    sections: [
      {
        id: 'sec_cgl_ga',
        title: 'General Awareness & Reasoning',
        questionCount: 2,
        durationMinutes: 30,
        sectionLock: false,
        questions: [
          { questionId: 'q_1', positiveMarks: 2.0, negativeMarks: 0.5 },
          { questionId: 'q_2', positiveMarks: 2.0, negativeMarks: 0.5 },
        ],
      },
    ],
  });

  console.log('[Seed] Seeding news sources and drafts...');
  targetDb.newsSources.set('pib-india', {
    id: 'pib-india',
    name: 'Press Information Bureau (PIB) Government of India',
    feedUrl: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
    isEnabled: true,
  });

  targetDb.newsDrafts.set('draft_01', {
    id: 'draft_01',
    candidateId: 'cand_101',
    title: 'Cabinet Approves National Green Hydrogen Mission Implementation Directives',
    originalSummary: 'The Union Cabinet chaired by the Prime Minister has approved operational modalities for standard incentives under the National Green Hydrogen Mission to achieve 5 MMT production by 2030.',
    category: 'Economy & National Policy',
    targetExams: ['SSC_CGL', 'RRB_NTPC', 'UPSC_CSE'],
    keyFacts: [
      'Target production: 5 MMT per annum by 2030',
      'Overseen by Ministry of New and Renewable Energy (MNRE)',
      'Strategic Intervention for Green Hydrogen Transition (SIGHT) programme allocation',
    ],
    sourceName: 'Press Information Bureau (PIB)',
    sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=1987654',
    confidenceScore: 0.98,
    editorialStatus: 'PUBLISHED',
    approvedBy: 'adm_1',
    approvalMode: 'MANUAL',
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log('[Seed] Seeding resources...');
  targetDb.resources.set('res_ssc_math_formula', {
    id: 'res_ssc_math_formula',
    title: 'SSC CGL Advanced Mathematics Formula Pocket Handbook',
    description: 'Comprehensive algebra, geometry, trigonometry, and coordinate geometry theorems verified for SSC CGL 2026.',
    exam: 'SSC_CGL',
    subject: 'Quantitative Aptitude',
    fileType: 'PDF',
    fileSizeBytes: 2457600,
    sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    storagePath: 'resources/ssc/ssc_cgl_math_handbook_2026.pdf',
    previewAllowed: true,
    downloadAllowed: true,
    offlineAllowed: true,
    previewContent: '<div class="formula-preview"><h3>Algebraic Identities</h3><p>(a + b)^2 = a^2 + 2ab + b^2</p><p>a^3 + b^3 + c^3 - 3abc = (a+b+c)(a^2+b^2+c^2-ab-bc-ca)</p></div>',
    licenseSource: 'SidPrep Academic Editorial Team',
    isPublished: true,
    verifiedDate: '2026-09-01',
  });

  targetDb.resources.set('res_rrb_science_notes', {
    id: 'res_rrb_science_notes',
    title: 'RRB NTPC General Science Essential Revision Sheet',
    description: 'Physics, Chemistry, and Life Sciences key principles and units.',
    exam: 'RRB_NTPC',
    subject: 'General Awareness',
    fileType: 'DOCX',
    fileSizeBytes: 1843200,
    sha256Hash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
    storagePath: 'resources/rrb/rrb_general_science_notes.pdf',
    previewAllowed: true,
    downloadAllowed: false,
    offlineAllowed: false,
    previewContent: '<div class="science-preview"><h3>Physical Constants & Units</h3><p>Speed of light: 3x10^8 m/s</p><p>Gravitational constant G: 6.674x10^-11 N m^2/kg^2</p></div>',
    licenseSource: 'SidPrep Academic Editorial Team',
    isPublished: true,
    verifiedDate: '2026-08-25',
  });

  console.log('[Seed] Seeding CMS pages...');
  const initialPages = [
    {
      id: 'page_about',
      slug: 'about',
      title: 'About SidPrep 2.0',
      subtitle: 'Free, open, and high-performance exam preparation for Indian aspirants',
      contentHtml: `<p>SidPrep 2.0 is an independent, non-profit aligned exam preparation platform engineered to deliver authoritative mock examinations, syllabus breakdowns, and verified daily current affairs for India's major public recruitment exams including SSC, RRB, WBPSC, and IBPS.</p><h3>Our Mission</h3><p>To eliminate financial barriers to government exam preparation by providing every aspirant with authentic, commission-pattern tests and real-time study tracking without predatory subscription paywalls.</p>`,
      metaTitle: 'About SidPrep 2.0 — Open Government Exam Preparation',
      metaDescription: 'Learn about SidPrep 2.0 mission, editorial independence, and exam coverage.',
      isPublished: true,
      isSystem: true,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'page_contact',
      slug: 'contact',
      title: 'Contact Us',
      subtitle: 'Get in touch with the SidPrep academic and support team',
      contentHtml: `<p>We welcome questions, feedback, bug reports, and academic corrections from students and educators.</p><h3>Support Channels</h3><p><strong>General Inquiries:</strong> <a href="mailto:support@sidprep.in">support@sidprep.in</a></p><p><strong>Editorial & Question Corrections:</strong> <a href="mailto:editorial@sidprep.in">editorial@sidprep.in</a></p><p><strong>Privacy & Legal:</strong> <a href="mailto:privacy@sidprep.in">privacy@sidprep.in</a></p>`,
      metaTitle: 'Contact SidPrep 2.0 — Support & Feedback',
      metaDescription: 'Reach the SidPrep team for student support, academic questions, or feedback.',
      isPublished: true,
      isSystem: true,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'page_terms',
      slug: 'terms',
      title: 'Terms of Service',
      subtitle: 'Guidelines and rules for using the SidPrep 2.0 ecosystem',
      contentHtml: `<p>By accessing or using the SidPrep website, mobile application, or mock test runner, you agree to comply with and be bound by these Terms of Service.</p><h3>Educational Purpose</h3><p>SidPrep 2.0 is an independent educational prep platform. Mock exams, test series, and syllabus guides are created for preparatory practice only.</p>`,
      metaTitle: 'Terms of Service — SidPrep 2.0',
      metaDescription: 'Terms and conditions governing the use of SidPrep 2.0 website and apps.',
      isPublished: true,
      isSystem: true,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'page_privacy',
      slug: 'privacy',
      title: 'Privacy Policy',
      subtitle: 'How we collect, store, and protect your information',
      contentHtml: `<p>Your privacy is paramount. SidPrep collects minimal student data required to deliver account functionality and offline test synchronization.</p><h3>Information We Collect</h3><ul><li>Email address (for authentication and password recovery)</li><li>Test attempt scores and timing telemetry</li><li>Device platform (Android/Web) for update delivery</li></ul>`,
      metaTitle: 'Privacy Policy — SidPrep 2.0',
      metaDescription: 'Read how SidPrep 2.0 protects user privacy and secures student prep records.',
      isPublished: true,
      isSystem: true,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'page_disclaimer',
      slug: 'disclaimer',
      title: 'Official Disclaimer',
      subtitle: 'SidPrep 2.0 is an independent educational platform',
      contentHtml: `<p><strong>SidPrep 2.0 is NOT affiliated with, authorized by, endorsed by, or in any way officially connected with the Staff Selection Commission (SSC), Railway Recruitment Boards (RRB), West Bengal Public Service Commission (WBPSC), Institute of Banking Personnel Selection (IBPS), or any other government ministry or agency.</strong></p>`,
      metaTitle: 'Disclaimer & Legal Status — SidPrep 2.0',
      metaDescription: 'Official disclaimer clarifying independent educational status from government bodies.',
      isPublished: true,
      isSystem: true,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'page_features',
      slug: 'features',
      title: 'SidPrep 2.0 Features & Capabilities',
      subtitle: 'Everything serious government exam candidates need to succeed',
      contentHtml: `<p>SidPrep 2.0 is an all-in-one preparation ecosystem engineered specifically for SSC, RRB, WBPSC, and IBPS examinations.</p>`,
      metaTitle: 'Features — SidPrep 2.0 Ecosystem',
      metaDescription: 'Explore features including offline test runner, verified current affairs, and official exam mocks.',
      isPublished: true,
      isSystem: true,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'page_data_deletion',
      slug: 'data-deletion',
      title: 'Student Data Deletion Policy',
      subtitle: 'Request permanent removal of your account and prep records',
      contentHtml: `<p>In accordance with data protection principles and student privacy rights, you may request complete deletion of your SidPrep account and all associated test attempt records at any time.</p>`,
      metaTitle: 'Student Data Deletion Policy — SidPrep 2.0',
      metaDescription: 'Information on requesting permanent deletion of student account data.',
      isPublished: true,
      isSystem: true,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ];

  for (const page of initialPages) {
    targetDb.pages.set(page.id, page);
  }

  console.log('[Seed] Database seeding completed successfully.');
}

// Standalone execution when invoked via `pnpm seed`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(async () => {
      await closePool();
      console.log('[Seed] Seed script finished.');
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Seed] Fatal seeding error:', err);
      await closePool();
      process.exit(1);
    });
}
