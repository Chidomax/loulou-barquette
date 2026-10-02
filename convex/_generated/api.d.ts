/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as access from "../access.js";
import type * as appFiles from "../appFiles.js";
import type * as auth from "../auth.js";
import type * as caisse from "../caisse.js";
import type * as crons from "../crons.js";
import type * as customers from "../customers.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as macaly from "../macaly.js";
import type * as menu from "../menu.js";
import type * as options from "../options.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as qaCleanup from "../qaCleanup.js";
import type * as shared from "../shared.js";
import type * as shop from "../shop.js";
import type * as stripe from "../stripe.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  access: typeof access;
  appFiles: typeof appFiles;
  auth: typeof auth;
  caisse: typeof caisse;
  crons: typeof crons;
  customers: typeof customers;
  http: typeof http;
  lib: typeof lib;
  macaly: typeof macaly;
  menu: typeof menu;
  options: typeof options;
  orders: typeof orders;
  payments: typeof payments;
  qaCleanup: typeof qaCleanup;
  shared: typeof shared;
  shop: typeof shop;
  stripe: typeof stripe;
  users: typeof users;
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
