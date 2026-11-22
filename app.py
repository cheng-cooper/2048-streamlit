import os
import secrets
import sqlite3
from contextlib import closing
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.config.update(
    MAX_CONTENT_LENGTH=4096,
    SECRET_KEY=os.getenv("GAME_SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_SAMESITE="Lax",
    ACCOUNT_DB=Path(app.root_path) / "accounts.sqlite3",
    SCORE_DB=Path(app.root_path) / "leaderboard.sqlite3",
)
ACCOUNT_PREFIX = "\x01account:"

redis_url = os.getenv("REDIS_URL")
redis_key = os.getenv("REDIS_LEADERBOARD_KEY", "2048:leaderboard")
redis_client = None
if redis_url:
    from redis import Redis
    from redis.exceptions import RedisError

    redis_client = Redis.from_url(
        redis_url, decode_responses=True, socket_connect_timeout=2, socket_timeout=2
    )

    @app.errorhandler(RedisError)
    def redis_error(error):
        return jsonify(error="Redis 暫時無法使用，請稍後再試。"), 503


@app.get("/")
def index():
    return render_template("index.html", account=session.get("account"))


@app.post("/api/account/<action>")
def account_action(action):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="請重新送出表單。"), 400
    if action == "logout":
        session.clear()
        return jsonify(ok=True)
    if action not in {"register", "login"}:
        return jsonify(error="找不到這個操作。"), 404

    username = data.get("username")
    username = username.strip() if isinstance(username, str) else ""
    password = data.get("password")
    if not (
        3 <= len(username) <= 20
        and all(char.isalnum() or char in "_-" for char in username)
        and isinstance(password, str)
        and 8 <= len(password) <= 128
    ):
        return jsonify(error="帳號須為 3 至 20 個字元，可用文字、數字、底線與連字號。密碼須為 8 至 128 個字元。"), 400

    password_hash = generate_password_hash(password) if action == "register" else None
    if redis_client is not None and app.config.get("ACCOUNTS_IN_REDIS"):
        account_key = f"{redis_key}:accounts"
        if password_hash is not None:
            created = redis_client.hsetnx(account_key, username, password_hash)
        else:
            stored_hash = redis_client.hget(account_key, username)
    else:
        with closing(sqlite3.connect(app.config["ACCOUNT_DB"])) as db, db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL)"
            )
            if password_hash is not None:
                created = db.execute(
                    "INSERT INTO accounts VALUES (?, ?) ON CONFLICT(username) DO NOTHING",
                    (username, password_hash),
                ).rowcount
            else:
                row = db.execute(
                    "SELECT password_hash FROM accounts WHERE username = ?", (username,)
                ).fetchone()
                stored_hash = row[0] if row else None

    if action == "register":
        if not created:
            return jsonify(error="這個帳號已有人使用。"), 409
    elif not stored_hash or not check_password_hash(stored_hash, password):
        return jsonify(error="帳號或密碼不正確。"), 401

    session.clear()
    session["account"] = username
    return jsonify(ok=True)


@app.route("/api/leaderboard", methods=["GET", "POST"])
def leaderboard():
    entry = None
    clear = None
    account = session.get("account")
    member = ACCOUNT_PREFIX + account if account else None
    personal = None
    if request.method == "POST":
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(error="請提供暱稱和分數。"), 400
        name = data.get("name")
        name = name.strip() if isinstance(name, str) else ""
        score = data.get("score")
        if "account" in data and data["account"] != account:
            return jsonify(error="登入狀態已變更，請重新整理後開始新的一局。"), 409
        if member:
            name = member
        elif not 1 <= len(name) <= 20 or not name.isprintable():
            return jsonify(error="暱稱須為 1 至 20 個字元。"), 400
        if type(score) is not int or not 0 <= score <= 10_000_000 or score % 4:
            return jsonify(error="分數格式不正確。"), 400
        entry = (name, score)
        if "clear" in data:
            result = data["clear"]
            if not isinstance(result, dict):
                return jsonify(error="通關成績格式不正確。"), 400
            elapsed_ms, steps = result.get("elapsed_ms"), result.get("steps")
            if not (
                type(elapsed_ms) is int and 1 <= elapsed_ms <= 2**53 - 1
                and type(steps) is int and 1 <= steps <= 10_000_000
                and score >= 2048
            ):
                return jsonify(error="通關成績格式不正確。"), 400
            clear = (name, elapsed_ms, steps)

    if redis_client is not None:
        time_key, steps_key = f"{redis_key}:time", f"{redis_key}:steps"
        with redis_client.pipeline() as pipe:
            if entry:
                pipe.zadd(redis_key, {name: score}, gt=True)
            if clear:
                pipe.zadd(time_key, {name: elapsed_ms}, lt=True)
                pipe.zadd(steps_key, {name: steps}, lt=True)
            if member:
                pipe.zrevrank(redis_key, member)
                pipe.zscore(redis_key, member)
            pipe.zrange(redis_key, 0, 9, desc=True, withscores=True)
            pipe.zrange(time_key, 0, 9, withscores=True)
            pipe.zrange(steps_key, 0, 9, withscores=True)
            results = pipe.execute()
            rows, time_rows, step_rows = results[-3:]
            if member:
                rank, best = results[-5:-3]
                if rank is not None:
                    personal = {"rank": rank + 1, "score": int(best)}
    else:
        with closing(sqlite3.connect(app.config["SCORE_DB"])) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS scores (name TEXT PRIMARY KEY, score INTEGER NOT NULL)")
            db.execute(
                "CREATE TABLE IF NOT EXISTS clears (name TEXT PRIMARY KEY, elapsed_ms INTEGER NOT NULL, "
                "steps INTEGER NOT NULL)"
            )
            if entry:
                db.execute(
                    "INSERT INTO scores VALUES (?, ?) ON CONFLICT(name) DO UPDATE "
                    "SET score = excluded.score WHERE excluded.score > scores.score",
                    entry,
                )
            if clear:
                db.execute(
                    "INSERT INTO clears VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET "
                    "elapsed_ms = MIN(clears.elapsed_ms, excluded.elapsed_ms), "
                    "steps = MIN(clears.steps, excluded.steps)",
                    clear,
                )
            rows = db.execute(
                "SELECT name, score FROM scores ORDER BY score DESC, name DESC LIMIT 10"
            ).fetchall()
            time_rows = db.execute(
                "SELECT name, elapsed_ms FROM clears ORDER BY elapsed_ms, name LIMIT 10"
            ).fetchall()
            step_rows = db.execute(
                "SELECT name, steps FROM clears ORDER BY steps, name LIMIT 10"
            ).fetchall()
            if member:
                best = db.execute(
                    "SELECT player.score, 1 + (SELECT COUNT(*) FROM scores AS other "
                    "WHERE (other.score, other.name) > (player.score, player.name)) "
                    "FROM scores AS player WHERE player.name = ?",
                    (member,),
                ).fetchone()
                if best:
                    personal = {"score": best[0], "rank": best[1]}

    response = dict(
        scores=ranking_entries(rows, "score"),
        fastest=ranking_entries(time_rows, "elapsed_ms"),
        fewest=ranking_entries(step_rows, "steps"),
    )
    if member:
        response["personal"] = personal
    return jsonify(response)


def ranking_entries(rows, metric):
    return [
        {"name": player.removeprefix(ACCOUNT_PREFIX), metric: int(value),
         "account": player.startswith(ACCOUNT_PREFIX)}
        for player, value in rows
    ]


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050)
