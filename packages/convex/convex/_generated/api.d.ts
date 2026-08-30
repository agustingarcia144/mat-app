/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as appBillingPlans from "../appBillingPlans.js";
import type * as billingDomain from "../billingDomain.js";
import type * as classAccess from "../classAccess.js";
import type * as classAlerts from "../classAlerts.js";
import type * as classMetrics from "../classMetrics.js";
import type * as classQuota from "../classQuota.js";
import type * as classReservations from "../classReservations.js";
import type * as classSchedules from "../classSchedules.js";
import type * as classes from "../classes.js";
import type * as crons from "../crons.js";
import type * as dayExercises from "../dayExercises.js";
import type * as exerciseBlocks from "../exerciseBlocks.js";
import type * as exercises from "../exercises.js";
import type * as finance from "../finance.js";
import type * as fixedClassSlots from "../fixedClassSlots.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as joinGym from "../joinGym.js";
import type * as joinGymNode from "../joinGymNode.js";
import type * as memberInviteCodes from "../memberInviteCodes.js";
import type * as memberInviteCodesNode from "../memberInviteCodesNode.js";
import type * as memberPaymentDomain from "../memberPaymentDomain.js";
import type * as memberPaymentNotifications from "../memberPaymentNotifications.js";
import type * as memberPayments from "../memberPayments.js";
import type * as memberPaymentsActions from "../memberPaymentsActions.js";
import type * as memberPaymentsAdmin from "../memberPaymentsAdmin.js";
import type * as memberPaymentsCheckout from "../memberPaymentsCheckout.js";
import type * as memberPaymentsCrypto from "../memberPaymentsCrypto.js";
import type * as memberPaymentsEnv from "../memberPaymentsEnv.js";
import type * as memberPaymentsHttp from "../memberPaymentsHttp.js";
import type * as memberPaymentsOAuth from "../memberPaymentsOAuth.js";
import type * as memberPlanSubscriptions from "../memberPlanSubscriptions.js";
import type * as membershipPlans from "../membershipPlans.js";
import type * as mercadoPagoClient from "../mercadoPagoClient.js";
import type * as mercadoPagoTransport from "../mercadoPagoTransport.js";
import type * as mercadoPagoWebhook from "../mercadoPagoWebhook.js";
import type * as metrics from "../metrics.js";
import type * as migrations from "../migrations.js";
import type * as modelWeekSlots from "../modelWeekSlots.js";
import type * as orgCreationCodes from "../orgCreationCodes.js";
import type * as orgCreationCodesNode from "../orgCreationCodesNode.js";
import type * as organizationBilling from "../organizationBilling.js";
import type * as organizationMemberships from "../organizationMemberships.js";
import type * as organizationSettings from "../organizationSettings.js";
import type * as organizations from "../organizations.js";
import type * as organizationsNode from "../organizationsNode.js";
import type * as payroll from "../payroll.js";
import type * as permissions from "../permissions.js";
import type * as planBonifications from "../planBonifications.js";
import type * as planPayments from "../planPayments.js";
import type * as planificationAssignments from "../planificationAssignments.js";
import type * as planificationRevisionHelpers from "../planificationRevisionHelpers.js";
import type * as planifications from "../planifications.js";
import type * as platformCommissions from "../platformCommissions.js";
import type * as platformInsights from "../platformInsights.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as pushNotificationsNode from "../pushNotificationsNode.js";
import type * as rewards from "../rewards.js";
import type * as rewardsDomain from "../rewardsDomain.js";
import type * as rewardsQr from "../rewardsQr.js";
import type * as scheduleBatchUtils from "../scheduleBatchUtils.js";
import type * as scheduleBatches from "../scheduleBatches.js";
import type * as seedDemoOrg from "../seedDemoOrg.js";
import type * as seedExercises from "../seedExercises.js";
import type * as seedTestOrg from "../seedTestOrg.js";
import type * as sessionExerciseLogs from "../sessionExerciseLogs.js";
import type * as staffShiftModelSlots from "../staffShiftModelSlots.js";
import type * as staffShifts from "../staffShifts.js";
import type * as userDeletion from "../userDeletion.js";
import type * as users from "../users.js";
import type * as walletActions from "../walletActions.js";
import type * as walletHttp from "../walletHttp.js";
import type * as webhookEvents from "../webhookEvents.js";
import type * as webhooks from "../webhooks.js";
import type * as workoutDaySessions from "../workoutDaySessions.js";
import type * as workoutDays from "../workoutDays.js";
import type * as workoutWeeks from "../workoutWeeks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  appBillingPlans: typeof appBillingPlans;
  billingDomain: typeof billingDomain;
  classAccess: typeof classAccess;
  classAlerts: typeof classAlerts;
  classMetrics: typeof classMetrics;
  classQuota: typeof classQuota;
  classReservations: typeof classReservations;
  classSchedules: typeof classSchedules;
  classes: typeof classes;
  crons: typeof crons;
  dayExercises: typeof dayExercises;
  exerciseBlocks: typeof exerciseBlocks;
  exercises: typeof exercises;
  finance: typeof finance;
  fixedClassSlots: typeof fixedClassSlots;
  folders: typeof folders;
  http: typeof http;
  joinGym: typeof joinGym;
  joinGymNode: typeof joinGymNode;
  memberInviteCodes: typeof memberInviteCodes;
  memberInviteCodesNode: typeof memberInviteCodesNode;
  memberPaymentDomain: typeof memberPaymentDomain;
  memberPaymentNotifications: typeof memberPaymentNotifications;
  memberPayments: typeof memberPayments;
  memberPaymentsActions: typeof memberPaymentsActions;
  memberPaymentsAdmin: typeof memberPaymentsAdmin;
  memberPaymentsCheckout: typeof memberPaymentsCheckout;
  memberPaymentsCrypto: typeof memberPaymentsCrypto;
  memberPaymentsEnv: typeof memberPaymentsEnv;
  memberPaymentsHttp: typeof memberPaymentsHttp;
  memberPaymentsOAuth: typeof memberPaymentsOAuth;
  memberPlanSubscriptions: typeof memberPlanSubscriptions;
  membershipPlans: typeof membershipPlans;
  mercadoPagoClient: typeof mercadoPagoClient;
  mercadoPagoTransport: typeof mercadoPagoTransport;
  mercadoPagoWebhook: typeof mercadoPagoWebhook;
  metrics: typeof metrics;
  migrations: typeof migrations;
  modelWeekSlots: typeof modelWeekSlots;
  orgCreationCodes: typeof orgCreationCodes;
  orgCreationCodesNode: typeof orgCreationCodesNode;
  organizationBilling: typeof organizationBilling;
  organizationMemberships: typeof organizationMemberships;
  organizationSettings: typeof organizationSettings;
  organizations: typeof organizations;
  organizationsNode: typeof organizationsNode;
  payroll: typeof payroll;
  permissions: typeof permissions;
  planBonifications: typeof planBonifications;
  planPayments: typeof planPayments;
  planificationAssignments: typeof planificationAssignments;
  planificationRevisionHelpers: typeof planificationRevisionHelpers;
  planifications: typeof planifications;
  platformCommissions: typeof platformCommissions;
  platformInsights: typeof platformInsights;
  pushNotifications: typeof pushNotifications;
  pushNotificationsNode: typeof pushNotificationsNode;
  rewards: typeof rewards;
  rewardsDomain: typeof rewardsDomain;
  rewardsQr: typeof rewardsQr;
  scheduleBatchUtils: typeof scheduleBatchUtils;
  scheduleBatches: typeof scheduleBatches;
  seedDemoOrg: typeof seedDemoOrg;
  seedExercises: typeof seedExercises;
  seedTestOrg: typeof seedTestOrg;
  sessionExerciseLogs: typeof sessionExerciseLogs;
  staffShiftModelSlots: typeof staffShiftModelSlots;
  staffShifts: typeof staffShifts;
  userDeletion: typeof userDeletion;
  users: typeof users;
  walletActions: typeof walletActions;
  walletHttp: typeof walletHttp;
  webhookEvents: typeof webhookEvents;
  webhooks: typeof webhooks;
  workoutDaySessions: typeof workoutDaySessions;
  workoutDays: typeof workoutDays;
  workoutWeeks: typeof workoutWeeks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
