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
  .action(async (address, options) => {
    try {
      dbService.addSubscription({
        address,
        type: options.type as any,
        label: options.label
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

program.parse(process.argv);
