#!/usr/bin/env node
import { Command } from 'commander';
import { monitorService } from './services/monitor.js';
import { startServer } from './services/api.js';
import { dbService } from './db/database.js';

const program = new Command();

program
  .name('helios')
  .description('Helios: High-performance Solana Account/Program Sentinel')
  .version('1.0.0');

program
  .command('start')
  .description('Start the monitor and API server')
  .action(async () => {
    await monitorService.start();
    const server = startServer();

    const shutdown = () => {
      console.log('\nShutting down...');
      monitorService.stop();
      server.close(() => {
        console.log('API Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program
  .command('add <address>')
  .description('Add a new address to watch')
  .option('-t, --type <type>', 'Type: account or program', 'account')
  .option('-l, --label <label>', 'Optional label for the address')
  .option('-s, --schema <schema>', 'Optional account schema name (for decoding)')
  .action(async (address, options) => {
    try {
      dbService.addSubscription({
        address,
        type: options.type as any,
        label: options.label,
        schema: options.schema
      });
      console.log(`Added ${options.type} subscription for ${address}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  });

program
  .command('list')
  .description('List all active subscriptions')
  .action(() => {
    const subs = dbService.getSubscriptions();
    console.table(subs);
  });

program
  .command('remove <address>')
  .description('Remove an address from watch list')
  .action((address) => {
    dbService.removeSubscription(address);
    console.log(`Removed subscription for ${address}`);
  });

program
  .command('idl-add <programId> <filePath>')
  .description('Add or update an IDL for a program from a local JSON file')
  .action(async (programId, filePath) => {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const idl = JSON.parse(content);
      dbService.saveIdl(programId, idl);
      console.log(`Successfully saved IDL for program ${programId}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  });

program
  .command('idl-list')
  .description('List all stored IDLs')
  .action(() => {
    const idls = dbService.getIdlList();
    console.table(idls.map(i => ({
      program_id: i.program_id,
      updated_at: new Date(i.updated_at).toISOString()
    })));
  });

program.parse(process.argv);
