#!/usr/bin/env node
/**
 * Create a test gym on the PRO plan with an admin you can sign in as.
 *
 * Built for the member-payments sandbox: run it twice with different emails to
 * get the two independent gyms the Mercado Pago isolation checks need.
 *
 * Usage:
 *   TEST_ADMIN_PASSWORD='...' node scripts/create-test-org.mjs --email admin@test.com
 *   node scripts/create-test-org.mjs --email admin@test.com --password '...' --name 'Gym A'
 *
 * Options:
 *   --email     <email>   Admin sign-in email. Required.
 *   --password  <pass>    Admin password. Prefer TEST_ADMIN_PASSWORD instead:
 *                         an argument is visible to anyone who can run `ps`.
 *   --name      <name>    Gym name. Default: "Gimnasio de prueba".
 *   --first     <name>    Admin first name. Default: "Admin".
 *   --last      <name>    Admin last name. Default: "Prueba".
 *
 * Creates a real Clerk user. Dev deployments only — it refuses --prod.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CONVEX_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "convex",
);

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.includes("--prod")) {
  fail(
    "This script seeds test data and creates a Clerk user. It will not target production.",
  );
}
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    [
      "Usage: TEST_ADMIN_PASSWORD='...' node scripts/create-test-org.mjs --email <email> [options]",
      "",
      "  --email     Admin sign-in email (required)",
      "  --password  Admin password (prefer TEST_ADMIN_PASSWORD)",
      "  --name      Gym name (default: Gimnasio de prueba)",
      "  --first     Admin first name (default: Admin)",
      "  --last      Admin last name (default: Prueba)",
    ].join("\n"),
  );
  process.exit(0);
}

function arg(name) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`--${name} needs a value`);
  return value;
}

const email = arg("email");
const password = arg("password") ?? process.env.TEST_ADMIN_PASSWORD;

if (!email) fail("--email is required. Run with --help for usage.");
if (!password) {
  fail(
    "No password. Set TEST_ADMIN_PASSWORD, or pass --password (visible in the process list).",
  );
}
if (password.length < 8) fail("Password must be at least 8 characters.");

const payload = {
  email,
  password,
  organizationName: arg("name") ?? "Gimnasio de prueba",
  adminFirstName: arg("first") ?? "Admin",
  adminLastName: arg("last") ?? "Prueba",
};

console.log(`\nCreating "${payload.organizationName}" with admin ${email}…`);

// The password reaches Convex through argv of this child process only; it is
// never written to a file and never logged.
const run = spawnSync(
  "npx",
  ["convex", "run", "seedTestOrg:createTestOrganization", JSON.stringify(payload)],
  { cwd: CONVEX_DIR, encoding: "utf8" },
);

if (run.error) fail(`Could not run the Convex CLI: ${run.error.message}`);

const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
if (run.status !== 0) {
  console.error(output);
  fail("Seeding failed. See the Convex output above.");
}

let result;
try {
  // `convex run` prints the return value as JSON, sometimes after log lines.
  const start = output.indexOf("{");
  result = JSON.parse(output.slice(start));
} catch {
  console.log(output);
  process.exit(0);
}

console.log(
  [
    "",
    "✔ Ready",
    "",
    `  Gym          ${result.organizationName}  (${result.slug})`,
    `  Org id       ${result.organizationId}`,
    `  Sign in      ${result.email}`,
    `  Clerk user   ${result.clerkUserId}${result.clerkUserCreated ? " (created)" : " (existing, reused)"}`,
    "",
  ].join("\n"),
);

if (!result.proMemberPaymentsEnabled) {
  console.log(
    [
      "⚠ The PRO plan on this deployment has member Mercado Pago disabled, so",
      "  this gym will not see the option. Enable it once with:",
      "",
      "    npx convex run appBillingPlans:ensureMemberPaymentPolicyInternal \\",
      `      '{"planKey":"pro","mercadoPagoEnabled":true,"platformFeeBps":0,"feeCollectionMode":"none"}'`,
      "",
    ].join("\n"),
  );
}

console.log("Next: sign in on the web app and open Configuración → Cobros a socios.\n");
