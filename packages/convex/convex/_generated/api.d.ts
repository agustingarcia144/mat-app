/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as classReservations from "../classReservations.js";
import type * as classSchedules from "../classSchedules.js";
import type * as classes from "../classes.js";
import type * as dayExercises from "../dayExercises.js";
import type * as exerciseBlocks from "../exerciseBlocks.js";
import type * as exercises from "../exercises.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as organizationMemberships from "../organizationMemberships.js";
import type * as organizations from "../organizations.js";
import type * as permissions from "../permissions.js";
import type * as planificationAssignments from "../planificationAssignments.js";
import type * as planifications from "../planifications.js";
import type * as seedExercises from "../seedExercises.js";
import type * as sessionExerciseLogs from "../sessionExerciseLogs.js";
import type * as users from "../users.js";
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
  classReservations: typeof classReservations;
  classSchedules: typeof classSchedules;
  classes: typeof classes;
  dayExercises: typeof dayExercises;
  exerciseBlocks: typeof exerciseBlocks;
  exercises: typeof exercises;
  folders: typeof folders;
  http: typeof http;
  migrations: typeof migrations;
  organizationMemberships: typeof organizationMemberships;
  organizations: typeof organizations;
  permissions: typeof permissions;
  planificationAssignments: typeof planificationAssignments;
  planifications: typeof planifications;
  seedExercises: typeof seedExercises;
  sessionExerciseLogs: typeof sessionExerciseLogs;
  users: typeof users;
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
