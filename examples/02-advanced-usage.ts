/**
 * Example 02: Advanced Usage - Upsert, Transactions, and Views
 *
 * This example demonstrates:
 * - Using upsert for insert-or-update semantics
 * - Working with views
 * - Filtering and sorting data
 */

import { createPane, openPane, Pane } from '@pane/core';
import { isOk, isErr } from '@deessejs/fp';

// Define a contacts table structure
const contactsTableDefinition = {
  name: 'contacts',
  label: 'Contact',
  labelPlural: 'Contacts',
  icon: 'user',
  fields: [
    { name: 'email', label: 'Email', type: 'text', required: true, unique: true },
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'phone', label: 'Phone', type: 'text', required: false },
    { name: 'company', label: 'Company', type: 'text', required: false },
    { name: 'tags', label: 'Tags', type: 'multiselect', required: false, options: ['vip', 'lead', 'customer', 'partner'] },
  ],
};

// Define a companies table structure
const companiesTableDefinition = {
  name: 'companies',
  label: 'Company',
  labelPlural: 'Companies',
  icon: 'building',
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'domain', label: 'Domain', type: 'text', required: true },
    { name: 'industry', label: 'Industry', type: 'select', required: false, options: ['tech', 'finance', 'healthcare', 'retail', 'other'] },
    { name: 'employee_count', label: 'Employee Count', type: 'number', required: false },
  ],
};

// Create document with multiple tables
async function createContactsDatabase(): Promise<Pane | null> {
  console.log('Creating contacts database...');

  const result = createPane({
    path: './contacts.pane',
    name: 'Contacts Database',
    overwrite: true,
  });

  if (isErr(result)) {
    console.error('Failed to create pane:', result.error);
    return null;
  }

  const pane = result.value;

  // Add tables
  const contactsResult = pane.addTable(contactsTableDefinition);
  if (isErr(contactsResult)) {
    console.error('Failed to add contacts table:', contactsResult.error);
    return null;
  }
  console.log('Contacts table created');

  const companiesResult = pane.addTable(companiesTableDefinition);
  if (isErr(companiesResult)) {
    console.error('Failed to add companies table:', companiesResult.error);
    return null;
  }
  console.log('Companies table created');

  return pane;
}

// Insert sample data
async function insertSampleData(pane: Pane) {
  console.log('\nInserting sample companies...');

  const companies = [
    { name: 'Acme Corp', domain: 'acme.com', industry: 'tech', employee_count: 500 },
    { name: 'Globex', domain: 'globex.com', industry: 'finance', employee_count: 200 },
    { name: 'Initech', domain: 'initech.com', industry: 'tech', employee_count: 50 },
  ];

  for (const company of companies) {
    const result = pane.create('companies', company);
    if (isOk(result)) {
      console.log(`Created company: ${company.name} (ID: ${result.value})`);
    }
  }

  console.log('\nInserting sample contacts...');

  const contacts = [
    { email: 'alice@acme.com', name: 'Alice Smith', company: 'Acme Corp', tags: ['vip', 'customer'] },
    { email: 'bob@globex.com', name: 'Bob Jones', company: 'Globex', tags: ['lead'] },
    { email: 'carol@initech.com', name: 'Carol White', company: 'Initech', tags: ['customer'] },
    { email: 'david@acme.com', name: 'David Brown', company: 'Acme Corp', tags: ['partner'] },
  ];

  for (const contact of contacts) {
    const result = pane.create('contacts', contact);
    if (isOk(result)) {
      console.log(`Created contact: ${contact.name} (ID: ${result.value})`);
    }
  }
}

// Demonstrate upsert - update if exists, insert if not
async function demonstrateUpsert(pane: Pane) {
  console.log('\n--- Upsert Demo ---');

  // Try to upsert a new contact
  const newContact = { email: 'eve@newco.com', name: 'Eve Davis', company: 'NewCo', tags: ['lead'] as string[] };
  const upsertResult = pane.upsert('contacts', newContact, ['email']);

  if (isOk(upsertResult)) {
    console.log(`Upsert successful! Contact ID: ${upsertResult.value.id} (${upsertResult.value.action})`);
  } else {
    console.error('Upsert failed:', upsertResult.error);
  }

  // Now upsert with same email - should update instead
  const existingContact = { email: 'eve@newco.com', name: 'Eve Updated', company: 'NewCo Inc', tags: ['vip', 'lead'] as string[] };
  const upsertUpdateResult = pane.upsert('contacts', existingContact, ['email']);

  if (isOk(upsertUpdateResult)) {
    console.log(`Upsert update successful! Contact ID: ${upsertUpdateResult.value.id} (${upsertUpdateResult.value.action})`);
  } else {
    console.error('Upsert update failed:', upsertUpdateResult.error);
  }

  // Read all contacts to verify
  const readResult = pane.read('contacts');
  if (isOk(readResult)) {
    console.log('\nAll contacts after upsert:');
    for (const contact of readResult.value) {
      console.log(`  - ${contact.name} (${contact.email}) at ${contact.company}`);
    }
  }
}

// Demonstrate filtering
async function demonstrateFiltering(pane: Pane) {
  console.log('\n--- Filtering Demo ---');

  const result = pane.read('contacts');

  if (isOk(result)) {
    // Simple filtering in memory (for demo purposes)
    const vipContacts = result.value.filter((c: Record<string, unknown>) =>
      Array.isArray(c.tags) && c.tags.includes('vip')
    );

    console.log('VIP contacts:');
    for (const contact of vipContacts) {
      console.log(`  - ${contact.name} (${contact.email})`);
    }

    // Filter by company
    const acmeContacts = result.value.filter((c: Record<string, unknown>) => c.company === 'Acme Corp');
    console.log('\nAcme Corp contacts:');
    for (const contact of acmeContacts) {
      console.log(`  - ${contact.name} (${contact.email})`);
    }
  }
}

// Main execution
async function main() {
  const pane = await createContactsDatabase();

  if (!pane) {
    console.error('Exiting due to error');
    return;
  }

  await insertSampleData(pane);
  await demonstrateUpsert(pane);
  await demonstrateFiltering(pane);

  // Commit and close
  console.log('\nCommitting and closing...');
  pane.commit();
  pane.close();

  console.log('\nDone!');
}

main().catch(console.error);