import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  HubError,
  type HumanConversation,
  type ResultShareDestination,
  type ResultShareSource,
  type SharedResultCard,
} from "@codex-web/shared";
import type { BrainstormRooms } from "./brainstorm.js";
import { CollaborationChat } from "./collaboration-chat.js";
import type { CollaborationSpaces } from "./collaboration-spaces.js";
import { ResultSnapshotLifetime } from "./result-snapshot-lifetime.js";
import { readSharedFile, sharedAssetPath } from "./team-assets.js";
import type { TeamProjects } from "./team-projects.js";

const missing = () =>
  new HubError(404, "CONVERSATION_UNAVAILABLE", "Разговор или материал недоступен.");
export class Communication {
  private readonly online = new Map<string, Map<string, number>>();
  readonly chat: CollaborationChat;
  readonly root: string;
  readonly lifetime: ResultSnapshotLifetime;
  constructor(
    readonly team: TeamProjects,
    readonly rooms: BrainstormRooms,
    readonly spaces: CollaborationSpaces,
  ) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS human_conversations(id TEXT PRIMARY KEY,ownerId TEXT NOT NULL REFERENCES team_users(id),title TEXT NOT NULL,dmKey TEXT UNIQUE,createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS human_members(conversationId TEXT NOT NULL REFERENCES human_conversations(id),userId TEXT NOT NULL REFERENCES team_users(id),active INTEGER NOT NULL DEFAULT 1,muted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(conversationId,userId));
      CREATE TABLE IF NOT EXISTS human_group_versions(conversationId TEXT PRIMARY KEY REFERENCES human_conversations(id),version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS human_group_invitations(id TEXT NOT NULL UNIQUE,conversationId TEXT NOT NULL REFERENCES human_conversations(id),userId TEXT NOT NULL REFERENCES team_users(id),state TEXT NOT NULL,createdAt INTEGER NOT NULL,PRIMARY KEY(conversationId,userId));
      CREATE TABLE IF NOT EXISTS shared_result_files(id TEXT PRIMARY KEY,ownerId TEXT NOT NULL REFERENCES team_users(id),source TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,createdAt INTEGER NOT NULL,UNIQUE(ownerId,source,sha256));
      CREATE TABLE IF NOT EXISTS result_share_grants(id TEXT PRIMARY KEY,snapshotId TEXT NOT NULL REFERENCES shared_result_files(id),ownerId TEXT NOT NULL REFERENCES team_users(id),kind TEXT NOT NULL,destinationId TEXT NOT NULL,messageId TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS result_ai_handoffs(id TEXT PRIMARY KEY,ownerId TEXT NOT NULL REFERENCES team_users(id),snapshotId TEXT NOT NULL REFERENCES shared_result_files(id),threadId TEXT NOT NULL,binding TEXT NOT NULL,dismissed INTEGER NOT NULL DEFAULT 0,createdAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS result_share_messages ON result_share_grants(kind,destinationId,messageId);
    `);
    spaces.journal.results = (actor, spaceId) => {
      spaces.access(actor, spaceId);
      return this.db
        .prepare(`SELECT g.id,g.messageId,g.ownerId,g.createdAt FROM result_share_grants g
        WHERE g.kind='space' AND g.destinationId=? AND g.revoked=0 ORDER BY g.createdAt DESC LIMIT 100`)
        .all(spaceId)
        .flatMap((r) => {
          const result = this.cards("space", spaceId, String(r.messageId)).find(
            (c) => c.id === r.id && !c.revoked,
          );
          const person = this.team.registry.user(String(r.ownerId));
          return result
            ? [
                {
                  id: "result:" + String(r.id),
                  kind: "result" as const,
                  at: Number(r.createdAt),
                  author: { id: person.id, name: person.name },
                  title: "Опубликован результат",
                  result,
                },
              ]
            : [];
        });
    };
    this.chat = new CollaborationChat(
      { team, access: (actor, id) => this.access(actor, id) },
      "conversation",
    );
    this.root = join(dirname(team.registry.path), "space-chat-files", "shared_result");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.lifetime = new ResultSnapshotLifetime(this);
    for (const kind of ["conversation", "space", "brainstorm"] as const) {
      this.destinationChat(kind).resultCards = (id, message) => this.cards(kind, id, message);
    }
  }
  get db() {
    return this.team.db;
  }
  access(actor: string, id: string) {
    this.team.registry.active(actor);
    const row = this.db
      .prepare(
        `SELECT c.* FROM human_conversations c JOIN human_members m ON m.conversationId=c.id WHERE c.id=? AND m.userId=? AND m.active=1`,
      )
      .get(id, actor);
    if (!row) throw missing();
    return row;
  }
  detail(actor: string, id: string): HumanConversation {
    const row = this.access(actor, id);
    const members = this.db
      .prepare(
        `SELECT u.id,u.name FROM human_members m JOIN team_users u ON u.id=m.userId WHERE m.conversationId=? AND m.active=1 ORDER BY u.name,u.id`,
      )
      .all(id)
      .map((r) => ({ id: String(r.id), name: String(r.name) }));
    const last = this.db
      .prepare(
        "SELECT text,authorId,seq FROM conversation_chat_messages WHERE spaceId=? ORDER BY seq DESC LIMIT 1",
      )
      .get(id);
    const attention = this.db
      .prepare(`SELECT min(m.seq) firstUnreadSeq,
      min(CASE WHEN EXISTS(SELECT 1 FROM json_each(m.mentions) WHERE json_extract(value,'$.id')=?) THEN m.seq END) mentionSeq,
      sum(CASE WHEN EXISTS(SELECT 1 FROM json_each(m.mentions) WHERE json_extract(value,'$.id')=?) THEN 1 ELSE 0 END) unreadMentions,
      count(*) unread FROM conversation_chat_messages m WHERE m.spaceId=? AND m.authorId<>?
      AND m.seq>COALESCE((SELECT seq FROM conversation_chat_reads WHERE spaceId=? AND userId=?),0)`)
      .get(actor, actor, id, actor, id, actor)!;
    return {
      firstUnreadSeq: attention.firstUnreadSeq === null ? null : Number(attention.firstUnreadSeq),
      mentionSeq: attention.mentionSeq === null ? null : Number(attention.mentionSeq),
      unreadMentions: Number(attention.unreadMentions ?? 0),
      lastSeq: Number(last?.seq ?? 0),
      preview: last
        ? (String(last.authorId) === actor ? "Вы: " : "") +
          (String(last.text).replace(/\s+/g, " ").slice(0, 140) || "Материал")
        : "Пока нет сообщений",
      id,
      ownerId: String(row.ownerId),
      kind: row.dmKey ? "direct" : "group",
      title: row.dmKey
        ? members
            .filter((m) => m.id !== actor)
            .map((m) => m.name)
            .join(", ") || "Личный разговор"
        : String(row.title),
      members,
      membersVersion: this.membersVersion(id),
      invitations:
        !row.dmKey && row.ownerId === actor
          ? this.db
              .prepare(
                `SELECT i.id,i.userId,u.name FROM human_group_invitations i JOIN team_users u ON u.id=i.userId WHERE i.conversationId=? AND i.state='pending' ORDER BY i.createdAt,i.id`,
              )
              .all(id)
              .map((r) => ({ id: String(r.id), userId: String(r.userId), name: String(r.name) }))
          : [],
      unread: Number(attention.unread),
      muted: !!this.db
        .prepare("SELECT muted FROM human_members WHERE conversationId=? AND userId=?")
        .get(id, actor)?.muted,
      updatedAt: Number(
        this.db
          .prepare("SELECT max(createdAt) n FROM conversation_chat_messages WHERE spaceId=?")
          .get(id)?.n || row.createdAt,
      ),
    };
  }
  list(actor: string) {
    this.team.registry.active(actor);
    return this.db
      .prepare(
        "SELECT conversationId id FROM human_members WHERE userId=? AND active=1 ORDER BY rowid DESC LIMIT 200",
      )
      .all(actor)
      .map((r) => this.detail(actor, String(r.id)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  create(
    actor: string,
    key: string,
    input: { members: string[]; title: string; kind?: "direct" | "group" },
  ) {
    const members = [...new Set([actor, ...input.members])].sort();
    if (members.length < 2 || members.length > 8)
      throw new HubError(400, "CONVERSATION_MEMBERS", "Выбери от 1 до 7 собеседников.");
    if (
      (input.kind === "direct" && members.length !== 2) ||
      (input.kind === "group" && !input.title.trim())
    )
      throw new HubError(
        400,
        "CONVERSATION_KIND",
        "Выбери одного собеседника или укажи название группы.",
      );
    for (const id of members) this.team.registry.active(id);
    const receipt = this.team.once(
      actor,
      "conversation.create",
      key,
      { members, title: input.title, ...(input.kind ? { kind: input.kind } : {}) },
      () => {
        const dmKey = input.kind !== "group" && members.length === 2 ? members.join(":") : null;
        const existing = dmKey
          ? this.db.prepare("SELECT id FROM human_conversations WHERE dmKey=?").get(dmKey)
          : null;
        if (existing) {
          // Leaving never lets another participant restore access on someone's behalf.
          if (
            this.db
              .prepare("SELECT 1 FROM human_members WHERE conversationId=? AND active=0")
              .get(String(existing.id))
          )
            throw new HubError(409, "CONVERSATION_LEFT", "Собеседник покинул этот разговор.");
          return { id: String(existing.id) };
        }
        if (
          members.some(
            (id) =>
              Number(
                this.db
                  .prepare("SELECT count(*) n FROM human_members WHERE userId=? AND active=1")
                  .get(id)?.n,
              ) >= 200,
          )
        )
          throw new HubError(409, "CONVERSATION_LIMIT", "Достигнут лимит разговоров.");
        this.db
          .prepare("INSERT INTO human_conversations VALUES(?,?,?,?,?)")
          .run(key, actor, input.title || "Групповой разговор", dmKey, Date.now());
        for (const id of members)
          this.db
            .prepare("INSERT INTO human_members(conversationId,userId) VALUES(?,?)")
            .run(key, id);
        return { id: key };
      },
    );
    return this.detail(actor, receipt.id);
  }
  preferences(actor: string, id: string, muted: boolean) {
    this.access(actor, id);
    this.db
      .prepare("UPDATE human_members SET muted=? WHERE conversationId=? AND userId=?")
      .run(+muted, id, actor);
    return this.detail(actor, id);
  }
  availability(actor: string, client?: { id: string; active: boolean }, now = Date.now()) {
    this.team.registry.active(actor);
    for (const [user, clients] of this.online) {
      for (const [id, at] of clients) if (now - at > 70000) clients.delete(id);
      if (!clients.size) this.online.delete(user);
    }
    if (client) {
      const clients = this.online.get(actor) ?? new Map<string, number>();
      clients.delete(client.id);
      if (client.active) clients.set(client.id, now);
      while (clients.size > 16) clients.delete(clients.keys().next().value!);
      if (clients.size) this.online.set(actor, clients);
      else this.online.delete(actor);
    }
    // Coarse current availability only: no last-seen log, project or conversation identity.
    return {
      online: this.db
        .prepare("SELECT id FROM team_users WHERE state='active'")
        .all()
        .map((r) => String(r.id))
        .filter((id) => this.online.has(id)),
    };
  }
  rename(actor: string, id: string, key: string, input: { title: string; version: number }) {
    this.access(actor, id);
    return this.team.once(actor, "conversation.rename", key, { id, ...input }, () => {
      this.groupOwner(actor, id);
      if (this.membersVersion(id) !== input.version)
        throw new HubError(
          409,
          "GROUP_CHANGED",
          "Группа изменилась. Проверь обновлённые настройки.",
        );
      this.db.prepare("UPDATE human_conversations SET title=? WHERE id=?").run(input.title, id);
      this.bumpMembers(id);
      return { ok: true };
    });
  }
  leave(actor: string, id: string) {
    return this.team.registry.transaction(() => {
      const row = this.access(actor, id);
      if (!row.dmKey && row.ownerId === actor && this.memberCount(id) > 1)
        throw new HubError(
          409,
          "GROUP_OWNER_REQUIRED",
          "Сначала передай группу другому участнику.",
        );
      this.db
        .prepare("UPDATE human_members SET active=0 WHERE conversationId=? AND userId=?")
        .run(id, actor);
      this.bumpMembers(id);
      if (!row.dmKey && row.ownerId === actor)
        this.db
          .prepare(
            "UPDATE human_group_invitations SET state='revoked' WHERE conversationId=? AND state='pending'",
          )
          .run(id);
      return { ok: true };
    });
  }
  private membersVersion(id: string) {
    return Number(
      this.db.prepare("SELECT version FROM human_group_versions WHERE conversationId=?").get(id)
        ?.version ?? 0,
    );
  }
  private bumpMembers(id: string) {
    this.db
      .prepare(
        "INSERT INTO human_group_versions VALUES(?,1) ON CONFLICT(conversationId) DO UPDATE SET version=version+1",
      )
      .run(id);
  }
  private memberCount(id: string) {
    return Number(
      this.db
        .prepare("SELECT count(*) n FROM human_members WHERE conversationId=? AND active=1")
        .get(id)?.n,
    );
  }
  private groupOwner(actor: string, id: string) {
    const row = this.access(actor, id);
    if (row.dmKey || row.ownerId !== actor)
      throw new HubError(403, "GROUP_OWNER_ONLY", "Участниками управляет владелец группы.");
  }
  groupChange(
    actor: string,
    id: string,
    key: string,
    input: {
      action: "invite" | "remove" | "transfer" | "revoke";
      userId: string;
      version: number;
    },
  ) {
    this.access(actor, id);
    return this.team.once(actor, "conversation.members", key, { id, ...input }, () => {
      this.groupOwner(actor, id);
      if (this.membersVersion(id) !== input.version)
        throw new HubError(
          409,
          "GROUP_CHANGED",
          "Состав группы изменился. Проверь обновлённый список.",
        );
      const target = this.db
        .prepare("SELECT active FROM human_members WHERE conversationId=? AND userId=?")
        .get(id, input.userId);
      if (input.userId === actor)
        throw new HubError(400, "GROUP_SELF", "Для себя используй выход из разговора.");
      if (input.action === "invite") {
        this.team.registry.active(input.userId);
        if (target?.active)
          throw new HubError(409, "GROUP_MEMBER_EXISTS", "Этот человек уже в группе.");
        if (
          this.db
            .prepare(
              "SELECT 1 FROM human_group_invitations WHERE conversationId=? AND userId=? AND state='pending'",
            )
            .get(id, input.userId)
        )
          throw new HubError(409, "GROUP_INVITATION_EXISTS", "Приглашение уже отправлено.");
        const pending = Number(
          this.db
            .prepare(
              "SELECT count(*) n FROM human_group_invitations WHERE conversationId=? AND state='pending'",
            )
            .get(id)?.n,
        );
        if (this.memberCount(id) + pending >= 8)
          throw new HubError(
            409,
            "GROUP_FULL",
            "В группе до 8 человек, включая ожидающие приглашения.",
          );
        this.db
          .prepare(
            "INSERT INTO human_group_invitations VALUES(?,?,?,'pending',?) ON CONFLICT(conversationId,userId) DO UPDATE SET id=excluded.id,state='pending',createdAt=excluded.createdAt",
          )
          .run(key, id, input.userId, Date.now());
      } else if (input.action === "revoke") {
        const changed = this.db
          .prepare(
            "UPDATE human_group_invitations SET state='revoked' WHERE conversationId=? AND userId=? AND state='pending'",
          )
          .run(id, input.userId);
        if (!changed.changes) throw missing();
      } else {
        if (!target?.active) throw missing();
        if (input.action === "transfer") {
          this.team.registry.active(input.userId);
          this.db
            .prepare("UPDATE human_conversations SET ownerId=? WHERE id=?")
            .run(input.userId, id);
          // Invitations are issued by an owner; a successor makes their own decisions.
          this.db
            .prepare(
              "UPDATE human_group_invitations SET state='revoked' WHERE conversationId=? AND state='pending'",
            )
            .run(id);
        } else
          this.db
            .prepare("UPDATE human_members SET active=0 WHERE conversationId=? AND userId=?")
            .run(id, input.userId);
      }
      this.bumpMembers(id);
      return { ok: true };
    });
  }
  invitations(actor: string) {
    this.team.registry.active(actor);
    return this.db
      .prepare(`SELECT i.id,i.conversationId,c.title,u.name ownerName FROM human_group_invitations i
      JOIN human_conversations c ON c.id=i.conversationId JOIN team_users u ON u.id=c.ownerId
      JOIN human_members m ON m.conversationId=c.id AND m.userId=c.ownerId AND m.active=1
      WHERE i.userId=? AND i.state='pending' AND u.state='active' ORDER BY i.createdAt DESC LIMIT 200`)
      .all(actor)
      .map((r) => ({
        id: String(r.id),
        conversationId: String(r.conversationId),
        title: String(r.title),
        ownerName: String(r.ownerName),
      }));
  }
  answerInvitation(actor: string, invitationId: string, key: string, accept: boolean) {
    this.team.registry.active(actor);
    // Exact invitation epoch: old receipts cannot restore a removed membership.
    const invitation = this.db
      .prepare("SELECT * FROM human_group_invitations WHERE id=? AND userId=?")
      .get(invitationId, actor);
    if (!invitation) throw missing();
    return this.team.once(
      actor,
      "conversation.invitation.answer",
      key,
      { invitationId, accept },
      () => {
        if (invitation.state !== "pending")
          throw new HubError(
            409,
            "GROUP_INVITATION_CLOSED",
            "Приглашение уже обработано или отозвано.",
          );
        const id = String(invitation.conversationId);
        const row = this.db.prepare("SELECT ownerId FROM human_conversations WHERE id=?").get(id)!;
        this.groupOwner(String(row.ownerId), id);
        if (accept) {
          if (this.memberCount(id) >= 8)
            throw new HubError(409, "GROUP_FULL", "В группе уже 8 участников.");
          if (
            Number(
              this.db
                .prepare("SELECT count(*) n FROM human_members WHERE userId=? AND active=1")
                .get(actor)?.n,
            ) >= 200
          )
            throw new HubError(409, "CONVERSATION_LIMIT", "Достигнут лимит разговоров.");
          this.db
            .prepare(
              "INSERT INTO human_members(conversationId,userId) VALUES(?,?) ON CONFLICT(conversationId,userId) DO UPDATE SET active=1",
            )
            .run(id, actor);
        }
        this.db
          .prepare("UPDATE human_group_invitations SET state=? WHERE id=?")
          .run(accept ? "accepted" : "declined", invitationId);
        this.bumpMembers(id);
        return { ok: true };
      },
    );
  }
  destinationChat(kind: ResultShareDestination["kind"]) {
    return kind === "conversation"
      ? this.chat
      : kind === "brainstorm"
        ? this.rooms.chat
        : this.spaces.chat;
  }
  destination(actor: string, d: ResultShareDestination, write = false) {
    if (d.kind === "conversation") return this.access(actor, d.id);
    if (d.kind === "brainstorm") return this.rooms.access(actor, d.id, write);
    return this.spaces.access(actor, d.id);
  }
  capture(
    actor: string,
    source: ResultShareSource,
    file: { name: string; mime: string; data: Buffer },
  ) {
    this.team.registry.active(actor);
    if (file.data.length > 32 * 1024 ** 2)
      throw new HubError(413, "SHARE_TOO_LARGE", "Материал больше 32 МБ.");
    const sha256 = createHash("sha256").update(file.data).digest("hex"),
      identity = JSON.stringify(source);
    const old = this.db
      .prepare("SELECT * FROM shared_result_files WHERE ownerId=? AND source=? AND sha256=?")
      .get(actor, identity, sha256);
    if (old && !this.lifetime.removed(String(old.id))) {
      this.bytes(old);
      return this.snapshot(old);
    }
    this.lifetime.sweep();
    if (
      Number(
        this.db
          .prepare(
            "SELECT coalesce(sum(f.bytes),0) n FROM shared_result_files f LEFT JOIN result_snapshot_lifetime l ON l.id=f.id WHERE l.removedAt IS NULL",
          )
          .get()?.n,
      ) +
        file.data.length >
      1024 ** 3
    )
      throw new HubError(507, "SHARE_STORAGE_FULL", "Хранилище пересылок заполнено.");
    const id = old ? String(old.id) : randomUUID();
    // biome-ignore lint/suspicious/noControlCharactersInRegex: download name only
    const name = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180) || "Результат";
    try {
      writeFileSync(sharedAssetPath(this.root, id), file.data, { flag: "wx", mode: 0o600 });
    } catch (error) {
      // Recover an interrupted explicit recapture after its bytes were written.
      // Never overwrite a mismatching or untrusted file at the immutable ID.
      if (!old || (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      readSharedFile(this.root, { id, bytes: Number(old.bytes), sha256: String(old.sha256) });
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!old)
        this.db
          .prepare("INSERT INTO shared_result_files VALUES(?,?,?,?,?,?,?,?)")
          .run(
            id,
            actor,
            identity,
            name,
            file.mime.slice(0, 120),
            file.data.length,
            sha256,
            Date.now(),
          );
      this.lifetime.restore(id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      unlinkSync(sharedAssetPath(this.root, id));
      throw e;
    }
    return this.snapshot(this.db.prepare("SELECT * FROM shared_result_files WHERE id=?").get(id)!);
  }
  private snapshot(r: Record<string, unknown>) {
    return {
      id: String(r.id),
      ownerId: String(r.ownerId),
      title: String(r.name),
      mime: String(r.mime),
      bytes: Number(r.bytes),
      sha256: String(r.sha256),
      createdAt: Number(r.createdAt),
    };
  }
  private bytes(r: Record<string, unknown>) {
    this.lifetime.touch(String(r.id));
    return readSharedFile(this.root, {
      id: String(r.id),
      bytes: Number(r.bytes),
      sha256: String(r.sha256),
    });
  }
  share(
    actor: string,
    key: string,
    input: { snapshotId: string; destination: ResultShareDestination; publicRoom: boolean },
  ) {
    this.destination(actor, input.destination, true);
    const snapshot = this.db
      .prepare("SELECT * FROM shared_result_files WHERE id=? AND ownerId=?")
      .get(input.snapshotId, actor);
    if (!snapshot) throw missing();
    if (input.destination.kind === "brainstorm" && !input.publicRoom)
      throw new HubError(
        409,
        "ROOM_AUDIENCE_REQUIRED",
        "Подтверди доступ всех пользователей к материалу в комнате.",
      );
    this.bytes(snapshot);
    return this.team.once(actor, "result.share", key, input, () => {
      const { kind, id } = input.destination;
      this.db
        .prepare("INSERT INTO result_share_grants VALUES(?,?,?,?,?,?,0,?)")
        .run(key, input.snapshotId, actor, kind, id, key, Date.now());
      // Same transaction as the grant and receipt: lost acknowledgement cannot duplicate either.
      const table =
        kind === "conversation" ? "conversation" : kind === "brainstorm" ? "brainstorm" : "space";
      this.db
        .prepare(
          `INSERT INTO ${table}_chat_messages(id,spaceId,authorId,text,createdAt) VALUES(?,?,?,?,?)`,
        )
        .run(key, id, actor, "", Date.now());
      return { id: key, destination: input.destination };
    });
  }
  cards(kind: ResultShareDestination["kind"], id: string, message: string): SharedResultCard[] {
    return this.db
      .prepare(
        "SELECT f.*,g.id grantId,g.revoked FROM result_share_grants g JOIN shared_result_files f ON f.id=g.snapshotId WHERE g.kind=? AND g.destinationId=? AND g.messageId=?",
      )
      .all(kind, id, message)
      .map((r) => ({
        ...this.snapshot(r),
        id: String(r.grantId),
        snapshotId: String(r.id),
        revoked: !!r.revoked,
      }));
  }
  private authorizedShare(actor: string, id: string) {
    const row = this.db
      .prepare(
        "SELECT f.*,g.kind,g.destinationId,g.revoked FROM result_share_grants g JOIN shared_result_files f ON f.id=g.snapshotId WHERE g.id=?",
      )
      .get(id);
    if (!row) throw missing();
    this.destination(actor, {
      kind: row.kind as ResultShareDestination["kind"],
      id: String(row.destinationId),
    });
    if (row.revoked)
      throw new HubError(410, "RESULT_SHARE_REVOKED", "Доступ к результату отозван.");
    return row;
  }
  describe(actor: string, id: string) {
    const row = this.authorizedShare(actor, id);
    this.lifetime.touch(String(row.id));
    return this.snapshot(row);
  }
  read(actor: string, id: string) {
    const row = this.authorizedShare(actor, id);
    return { ...this.snapshot(row), data: this.bytes(row) };
  }
  ownerSnapshot(actor: string, id: string) {
    this.team.registry.active(actor);
    const row = this.db
      .prepare("SELECT * FROM shared_result_files WHERE id=? AND ownerId=?")
      .get(id, actor);
    if (!row) throw missing();
    return { ...this.snapshot(row), data: this.bytes(row) };
  }
  grants(actor: string, snapshotId: string) {
    this.team.registry.active(actor);
    if (
      !this.db
        .prepare("SELECT 1 FROM shared_result_files WHERE id=? AND ownerId=?")
        .get(snapshotId, actor)
    )
      throw missing();
    this.lifetime.touch(snapshotId);
    return this.db
      .prepare(
        "SELECT id,kind,destinationId,revoked,createdAt FROM result_share_grants WHERE snapshotId=? ORDER BY createdAt DESC",
      )
      .all(snapshotId);
  }
  revoke(actor: string, id: string) {
    this.team.registry.active(actor);
    if (
      !this.db.prepare("SELECT 1 FROM result_share_grants WHERE id=? AND ownerId=?").get(id, actor)
    )
      throw missing();
    const row = this.db.prepare("SELECT snapshotId FROM result_share_grants WHERE id=?").get(id)!;
    // Restart grace only on the first explicit revoke, not on receipt retries.
    const changed = this.db
      .prepare("UPDATE result_share_grants SET revoked=1 WHERE id=? AND revoked=0")
      .run(id);
    if (changed.changes) this.lifetime.touch(String(row.snapshotId));
    return { ok: true };
  }
}
