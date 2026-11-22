from pathlib import Path

import streamlit as st
from streamlit.components.v1 import declare_component


ROOT = Path(__file__).resolve().parent
st.set_page_config(page_title="2048 排行榜", layout="wide")
st.html("""
<style>
    [data-testid="stAppViewContainer"], [data-testid="stHeader"] {
        background-color: #f6f5ee;
        color: #252d29;
    }
    [data-testid="stHeader"] button {
        color: #252d29;
    }
    [data-testid="stMainBlockContainer"] {
        max-width: none;
        padding: 2.5rem 0 0;
    }
    [data-testid="stMainBlockContainer"] iframe {
        display: block;
        width: 100%;
        min-height: calc(100dvh - 2.5rem);
    }
</style>
""")

# Streamlit exposes top-level secrets as environment variables when loaded.
try:
    st.secrets.get("REDIS_URL")
except FileNotFoundError:
    pass

from app import app, redis_client

app.config["ACCOUNTS_IN_REDIS"] = redis_client is not None
# Streamlit can refresh the frontend files without restarting the Flask module.
app.jinja_env.auto_reload = True


@st.cache_resource(show_spinner=False)
def seed_demo_rankings():
    records = (
        ("青禾", 1840, None),
        ("晚風", 2968, None),
        ("山雀", 11640, {"elapsed_ms": 482350, "steps": 934}),
        ("橙雨", 14820, {"elapsed_ms": 539120, "steps": 812}),
        ("星野", 13264, {"elapsed_ms": 568640, "steps": 887}),
        ("霧島", 6248, None),
        ("小滿", 4380, None),
        ("白露", 12560, {"elapsed_ms": 514270, "steps": 978}),
        ("海岬", 5344, None),
        ("北辰", 8272, None),
        ("初晴", 16104, {"elapsed_ms": 455820, "steps": 902}),
        ("松果", 10996, {"elapsed_ms": 613470, "steps": 754}),
    )
    seed_client = app.test_client()
    for name, score, clear in records:
        entry = {"name": name, "score": score}
        if clear:
            entry["clear"] = clear
        response = seed_client.post("/api/leaderboard", json=entry)
        if response.status_code >= 400:
            raise RuntimeError("Could not seed demo rankings.")


try:
    seed_demo_rankings()
except RuntimeError:
    # The game remains playable while the ranking storage is unavailable.
    pass

if "game_client" not in st.session_state:
    st.session_state.game_client = app.test_client()
    st.session_state.game_frame = 0
    st.session_state.game_response = None

client = st.session_state.game_client
game = declare_component("game2048", path=ROOT / "streamlit_component")
document = client.get("/").get_data(as_text=True)
request = game(
    markup=document.split("<body>", 1)[1].split("</body>", 1)[0],
    stylesheet=(ROOT / "static/style.css").read_text(encoding="utf-8"),
    script=(ROOT / "static/game.js").read_text(encoding="utf-8"),
    response=st.session_state.game_response,
    key=f"game2048-{st.session_state.game_frame}",
    default=None,
)

routes = {
    "/api/leaderboard": {"GET", "POST"},
    "/api/account/login": {"POST"},
    "/api/account/register": {"POST"},
    "/api/account/logout": {"POST"},
}
if isinstance(request, dict):
    request_id = request.get("id")
    previous = st.session_state.game_response
    if isinstance(request_id, str) and (previous is None or previous["id"] != request_id):
        path, method = request.get("path"), request.get("method")
        if isinstance(path, str) and isinstance(method, str) and method in routes.get(path, ()):
            response = client.open(path, method=method, json=request.get("data"))
            result = response.get_json(silent=True) or {"error": "伺服器暫時無法完成請求。"}
            st.session_state.game_response = {"id": request_id, "ok": response.status_code < 400, "data": result}
            if path.startswith("/api/account/") and response.status_code == 200:
                st.session_state.game_frame += 1
        else:
            st.session_state.game_response = {"id": request_id, "ok": False, "data": {"error": "無效的請求。"}}
        st.rerun()
