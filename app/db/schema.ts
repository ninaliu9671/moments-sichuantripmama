import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  daysJson: text("days_json").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  inviteTokenHash: text("invite_token_hash"),
  inviteEnabled: integer("invite_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    platformUserId: text("platform_user_id"),
    displayName: text("display_name").notNull(),
    avatar: integer("avatar").notNull(),
    pinHash: text("pin_hash").notNull(),
    recoveryHash: text("recovery_hash").notNull(),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("users_platform_user_id_unique").on(table.platformUserId),
    check("users_avatar_range", sql`${table.avatar} between 1 and 16`),
  ],
);

export const tripMemberships = sqliteTable(
  "trip_memberships",
  {
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["owner", "traveler", "family"] }).notNull(),
    status: text("status", { enum: ["active", "left"] }).notNull().default("active"),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tripId, table.userId] }),
    index("trip_memberships_user_idx").on(table.userId),
    index("trip_memberships_trip_status_idx").on(table.tripId, table.status),
  ],
);

export const places = sqliteTable(
  "places",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    dayIndicesJson: text("day_indices_json").notNull().default("[]"),
    mapX: integer("map_x").notNull().default(50),
    mapY: integer("map_y").notNull().default(50),
    subplacesJson: text("subplaces_json").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("places_trip_name_unique").on(table.tripId, table.name),
    index("places_trip_idx").on(table.tripId),
    check("places_map_x_range", sql`${table.mapX} between 0 and 100`),
    check("places_map_y_range", sql`${table.mapY} between 0 and 100`),
  ],
);

export const moments = sqliteTable(
  "moments",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    text: text("text").notNull().default(""),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    subplace: text("subplace").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("moments_trip_created_idx").on(table.tripId, table.createdAt),
    index("moments_trip_place_idx").on(table.tripId, table.placeId),
    index("moments_author_idx").on(table.authorId),
  ],
);

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    momentId: text("moment_id").references(() => moments.id, { onDelete: "set null" }),
    type: text("type", { enum: ["photo", "video", "audio"] }).notNull(),
    objectKey: text("object_key").notNull(),
    thumbKey: text("thumb_key"),
    posterKey: text("poster_key"),
    duration: integer("duration").notNull().default(0),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("media_moment_sort_idx").on(table.momentId, table.sortOrder),
    index("media_owner_unbound_idx").on(table.ownerId, table.momentId),
    uniqueIndex("media_object_key_unique").on(table.objectKey),
    check("media_size_positive", sql`${table.size} > 0`),
    check("media_duration_nonnegative", sql`${table.duration} >= 0`),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    momentId: text("moment_id").notNull().references(() => moments.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    parentId: text("parent_id"),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("comments_moment_created_idx").on(table.momentId, table.createdAt),
    index("comments_parent_idx").on(table.parentId),
  ],
);

export const reactions = sqliteTable(
  "reactions",
  {
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    momentId: text("moment_id").notNull().references(() => moments.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.momentId, table.userId, table.emoji] }),
    index("reactions_trip_idx").on(table.tripId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
  blockedUntil: integer("blocked_until"),
  updatedAt: integer("updated_at").notNull(),
});
