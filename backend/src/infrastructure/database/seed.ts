// ============================================================================
// PubFlow AI - Database Seed Script
// Creates a demo tenant with sample data for testing
// ============================================================================

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool, publicQuery, query } from './pool.js';
import { tenantManager } from './tenant-manager.js';
import { logger } from '../logging/logger.js';

// --------------------------------------------------------------------------
// Demo Data
// --------------------------------------------------------------------------

const DEMO_TENANT = {
  name: 'Demo Publishing',
  slug: 'demo',
  planId: 'pro',
  settings: {
    branding: { companyName: 'Demo Publishing Co.' },
    features: {
      aiEnrichment: true,
      aiMatching: true,
      cwrGeneration: true,
      royaltyProcessing: true,
    },
  },
};

const DEMO_USER = {
  email: 'demo@pubflow.ai',
  password: 'demo1234',
  firstName: 'Demo',
  lastName: 'User',
  role: 'OWNER' as const,
};

const DEMO_WRITERS = [
  { firstName: 'John', lastName: 'Lennon', ipiNameNumber: '00014107338', prSociety: 'ASCAP', isControlled: true },
  { firstName: 'Paul', lastName: 'McCartney', ipiNameNumber: '00029472800', prSociety: 'ASCAP', isControlled: true },
  { firstName: 'Max', lastName: 'Martin', ipiNameNumber: '00158527925', prSociety: 'STIM', isControlled: false },
  { firstName: 'Taylor', lastName: 'Swift', ipiNameNumber: '00515576979', prSociety: 'ASCAP', isControlled: false },
  { firstName: 'Billie', lastName: 'Eilish', ipiNameNumber: '00743578920', prSociety: 'BMI', isControlled: true },
  { firstName: 'Finneas', lastName: 'O\'Connell', ipiNameNumber: '00743578921', prSociety: 'BMI', isControlled: true },
];

const DEMO_PUBLISHERS = [
  { name: 'Demo Publishing', publisherCode: 'DEMO01', prSociety: 'ASCAP', isControlled: true },
  { name: 'Stellar Songs', publisherCode: 'STEL01', prSociety: 'BMI', isControlled: true },
  { name: 'Big Music LLC', publisherCode: 'BIGM01', prSociety: 'SESAC', isControlled: false },
];

const DEMO_WORKS = [
  {
    title: 'Yesterday',
    workCode: 'DEMO-001',
    iswc: 'T-010.061.613-1',
    workType: 'ORI',
    duration: 126,
    language: 'EN',
    prOwnership: 50.00,
    mrOwnership: 50.00,
  },
  {
    title: 'Let It Be',
    workCode: 'DEMO-002',
    iswc: 'T-010.061.614-2',
    workType: 'ORI',
    duration: 243,
    language: 'EN',
    prOwnership: 75.00,
    mrOwnership: 75.00,
  },
  {
    title: 'Shake It Off',
    workCode: 'DEMO-003',
    iswc: 'T-070.000.001-3',
    workType: 'ORI',
    duration: 219,
    language: 'EN',
    prOwnership: 25.00,
    mrOwnership: 25.00,
  },
  {
    title: 'Bad Guy',
    workCode: 'DEMO-004',
    iswc: 'T-927.123.456-7',
    workType: 'ORI',
    duration: 194,
    language: 'EN',
    prOwnership: 100.00,
    mrOwnership: 100.00,
  },
  {
    title: 'Ocean Eyes',
    workCode: 'DEMO-005',
    iswc: 'T-927.123.457-8',
    workType: 'ORI',
    duration: 200,
    language: 'EN',
    prOwnership: 100.00,
    mrOwnership: 100.00,
  },
  {
    title: 'Blinding Lights',
    workCode: 'DEMO-006',
    workType: 'ORI',
    duration: 200,
    language: 'EN',
    prOwnership: 50.00,
    mrOwnership: 50.00,
  },
  {
    title: 'Midnight Dreams',
    workCode: 'DEMO-007',
    workType: 'ORI',
    duration: 245,
    language: 'EN',
    prOwnership: 100.00,
    mrOwnership: 100.00,
  },
  {
    title: 'Electric Pulse',
    workCode: 'DEMO-008',
    workType: 'ORI',
    duration: 210,
    language: 'EN',
    prOwnership: 75.00,
    mrOwnership: 75.00,
  },
];

const DEMO_RECORDINGS = [
  { workIndex: 0, isrc: 'GBAYE6500103', recordingTitle: 'Yesterday', releaseDate: '1965-09-13', recordLabel: 'Parlophone' },
  { workIndex: 1, isrc: 'GBAYE7000054', recordingTitle: 'Let It Be', releaseDate: '1970-03-06', recordLabel: 'Apple Records' },
  { workIndex: 2, isrc: 'USUG11401467', recordingTitle: 'Shake It Off', releaseDate: '2014-08-18', recordLabel: 'Big Machine' },
  { workIndex: 3, isrc: 'USUM71900764', recordingTitle: 'Bad Guy', releaseDate: '2019-03-29', recordLabel: 'Interscope' },
  { workIndex: 4, isrc: 'USUM71607031', recordingTitle: 'Ocean Eyes', releaseDate: '2016-11-18', recordLabel: 'Interscope' },
];

// --------------------------------------------------------------------------
// Seed Function
// --------------------------------------------------------------------------

async function seed() {
  logger.info('Starting database seed...');

  try {
    // Check if demo tenant already exists
    const existingTenant = await tenantManager.getTenantBySlug(DEMO_TENANT.slug);
    if (existingTenant) {
      logger.info('Demo tenant already exists, skipping seed');
      console.log('\n✅ Demo tenant already exists!');
      console.log(`   Email: ${DEMO_USER.email}`);
      console.log(`   Password: ${DEMO_USER.password}`);
      await pool.end();
      return;
    }

    // Create demo tenant
    logger.info('Creating demo tenant...');
    const tenant = await tenantManager.createTenant(
      DEMO_TENANT.name,
      DEMO_TENANT.slug,
      DEMO_TENANT.planId,
      DEMO_TENANT.settings
    );
    logger.info('Demo tenant created', { tenantId: tenant.id });

    // Create demo user
    logger.info('Creating demo user...');
    const passwordHash = await bcrypt.hash(DEMO_USER.password, 12);
    await publicQuery(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [DEMO_USER.email, passwordHash, DEMO_USER.firstName, DEMO_USER.lastName, tenant.id, DEMO_USER.role]
    );
    logger.info('Demo user created');

    // Set search path to tenant schema
    const schemaName = tenant.schemaName;

    // Insert writers
    logger.info('Creating demo writers...');
    const writerIds: string[] = [];
    for (const writer of DEMO_WRITERS) {
      const result = await query<{ id: string }>(
        schemaName,
        `INSERT INTO writers (first_name, last_name, ipi_name_number, pr_society, is_controlled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [writer.firstName, writer.lastName, writer.ipiNameNumber, writer.prSociety, writer.isControlled]
      );
      writerIds.push(result.rows[0].id);
    }
    logger.info(`Created ${writerIds.length} writers`);

    // Insert publishers
    logger.info('Creating demo publishers...');
    const publisherIds: string[] = [];
    for (const publisher of DEMO_PUBLISHERS) {
      const result = await query<{ id: string }>(
        schemaName,
        `INSERT INTO publishers (name, publisher_code, pr_society, is_controlled)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [publisher.name, publisher.publisherCode, publisher.prSociety, publisher.isControlled]
      );
      publisherIds.push(result.rows[0].id);
    }
    logger.info(`Created ${publisherIds.length} publishers`);

    // Insert works
    logger.info('Creating demo works...');
    const workIds: string[] = [];
    for (const work of DEMO_WORKS) {
      const result = await query<{ id: string }>(
        schemaName,
        `INSERT INTO works (title, work_code, iswc, work_type, duration, language, pr_ownership, mr_ownership)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [work.title, work.workCode, work.iswc || null, work.workType, work.duration, work.language, work.prOwnership, work.mrOwnership]
      );
      workIds.push(result.rows[0].id);
    }
    logger.info(`Created ${workIds.length} works`);

    // Link writers to works (simplified - just link first two writers to first two works)
    logger.info('Linking writers to works...');

    // Yesterday - John Lennon & Paul McCartney
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'CA', 50, true, 25, 25)`,
      [workIds[0], writerIds[0]]
    );
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'CA', 50, true, 25, 25)`,
      [workIds[0], writerIds[1]]
    );

    // Let It Be - same
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'CA', 50, true, 37.5, 37.5)`,
      [workIds[1], writerIds[0]]
    );
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'CA', 50, true, 37.5, 37.5)`,
      [workIds[1], writerIds[1]]
    );

    // Shake It Off - Max Martin & Taylor Swift
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'C', 50, false, 12.5, 12.5)`,
      [workIds[2], writerIds[2]]
    );
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'CA', 50, false, 12.5, 12.5)`,
      [workIds[2], writerIds[3]]
    );

    // Bad Guy - Billie Eilish & Finneas
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'CA', 50, true, 50, 50)`,
      [workIds[3], writerIds[4]]
    );
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'C', 50, true, 50, 50)`,
      [workIds[3], writerIds[5]]
    );

    // Ocean Eyes - Finneas
    await query(schemaName,
      `INSERT INTO writers_in_works (work_id, writer_id, role, share, is_controlled, pr_share, mr_share)
       VALUES ($1, $2, 'CA', 100, true, 100, 100)`,
      [workIds[4], writerIds[5]]
    );

    logger.info('Linked writers to works');

    // Link publishers to works
    logger.info('Linking publishers to works...');
    for (let i = 0; i < workIds.length; i++) {
      const pubIndex = i % publisherIds.length;
      await query(schemaName,
        `INSERT INTO publishers_in_works (work_id, publisher_id, role, pr_share, mr_share, sequence)
         VALUES ($1, $2, 'E', 50, 50, 1)`,
        [workIds[i], publisherIds[pubIndex]]
      );
    }
    logger.info('Linked publishers to works');

    // Insert recordings
    logger.info('Creating demo recordings...');
    for (const recording of DEMO_RECORDINGS) {
      await query(schemaName,
        `INSERT INTO recordings (work_id, isrc, recording_title, release_date, record_label)
         VALUES ($1, $2, $3, $4, $5)`,
        [workIds[recording.workIndex], recording.isrc, recording.recordingTitle, recording.releaseDate, recording.recordLabel]
      );
    }
    logger.info(`Created ${DEMO_RECORDINGS.length} recordings`);

    // Create a sample CWR export
    logger.info('Creating sample CWR export...');
    await query(schemaName,
      `INSERT INTO cwr_exports (version, submitter_code, receiver_code, filename, work_count, transaction_type, status)
       VALUES ('22', 'DMO', 'ASC', 'CW220001DMO_ASC.V22', $1, 'NWR', 'GENERATED')`,
      [workIds.length]
    );
    logger.info('Created sample CWR export');

    // Create sample royalty statement
    logger.info('Creating sample royalty statement...');
    const stmtResult = await query<{ id: string }>(schemaName,
      `INSERT INTO royalty_statements (filename, source_type, period, format, total_lines, matched_lines, total_amount, status)
       VALUES ('spotify_q4_2024.csv', 'Spotify', 'Q4 2024', 'CSV', 150, 120, 15234.56, 'REVIEW')
       RETURNING id`
    );
    const statementId = stmtResult.rows[0].id;

    // Create sample royalty statement lines
    logger.info('Creating sample royalty statement lines...');
    const sampleLines = [
      { title: 'Yesterday', amount: 1250.00, status: 'AUTO_MATCHED', confidence: 0.98, workIndex: 0 },
      { title: 'Let It Be', amount: 890.50, status: 'AUTO_MATCHED', confidence: 0.95, workIndex: 1 },
      { title: 'Shake it Off (Radio Edit)', amount: 2340.00, status: 'AI_MATCHED', confidence: 0.87, workIndex: 2 },
      { title: 'Bad Guy', amount: 4567.89, status: 'AUTO_MATCHED', confidence: 0.99, workIndex: 3 },
      { title: 'Ocean Eyes (Acoustic)', amount: 1123.45, status: 'AI_MATCHED', confidence: 0.78, workIndex: 4 },
      { title: 'Unknown Track 1', amount: 234.56, status: 'UNMATCHED', confidence: null, workIndex: null },
      { title: 'Mystery Song', amount: 567.89, status: 'UNMATCHED', confidence: null, workIndex: null },
    ];

    for (let i = 0; i < sampleLines.length; i++) {
      const line = sampleLines[i];
      await query(schemaName,
        `INSERT INTO royalty_statement_lines
         (statement_id, line_number, raw_data, song_title, amount, match_status, matched_work_id, match_confidence, match_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          statementId,
          i + 1,
          JSON.stringify({ original_title: line.title, royalty: line.amount }),
          line.title,
          line.amount,
          line.status,
          line.workIndex !== null ? workIds[line.workIndex] : null,
          line.confidence,
          line.status === 'UNMATCHED' ? null : (line.status === 'AUTO_MATCHED' ? 'EXACT' : 'AI_EMBEDDING'),
        ]
      );
    }
    logger.info(`Created ${sampleLines.length} royalty statement lines`);

    // Create sample conflicts
    logger.info('Creating sample conflicts...');
    await query(schemaName,
      `INSERT INTO conflict_records (work_id, conflict_type, severity, description, status)
       VALUES ($1, 'OWNERSHIP_MISMATCH', 'MEDIUM', 'Publisher ownership shares exceed 100% for PR rights', 'OPEN')`,
      [workIds[5]]
    );
    await query(schemaName,
      `INSERT INTO conflict_records (work_id, conflict_type, severity, description, status)
       VALUES ($1, 'DUPLICATE_SUSPECTED', 'LOW', 'Possible duplicate entry detected - similar title and writers', 'IN_REVIEW')`,
      [workIds[6]]
    );
    logger.info('Created sample conflicts');

    console.log('\n✅ Database seeded successfully!\n');
    console.log('Demo credentials:');
    console.log(`  Email: ${DEMO_USER.email}`);
    console.log(`  Password: ${DEMO_USER.password}`);
    console.log(`  Tenant: ${DEMO_TENANT.name} (${DEMO_TENANT.slug})`);
    console.log(`\nCreated:`);
    console.log(`  - ${DEMO_WRITERS.length} writers`);
    console.log(`  - ${DEMO_PUBLISHERS.length} publishers`);
    console.log(`  - ${DEMO_WORKS.length} works`);
    console.log(`  - ${DEMO_RECORDINGS.length} recordings`);
    console.log(`  - 1 CWR export`);
    console.log(`  - 1 royalty statement with ${sampleLines.length} lines`);
    console.log(`  - 2 conflicts\n`);

    logger.info('Seed completed successfully');
  } catch (error) {
    logger.error('Seed failed', { error });
    console.error('\n❌ Seed failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run seed
seed().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
