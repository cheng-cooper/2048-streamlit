# 2048 的 Streamlit 版本

## 在 Windows 本機測試

將 ZIP 完整解壓縮，在解壓後的專案資料夾開啟 CMD，執行：

```cmd
"%USERPROFILE%\venv\Scripts\python.exe" -m pip install -r requirements.txt
"%USERPROFILE%\venv\Scripts\python.exe" -m streamlit run streamlit_app.py
```

保持 CMD 視窗開啟，瀏覽 `http://localhost:8501`。未設定 `REDIS_URL` 時，帳號與排行榜使用這個資料夾的 SQLite 檔案。

## 發布到 Streamlit Community Cloud

1. 把解壓後的專案檔案上傳到 GitHub 儲存庫。保留 `static`、`templates` 和 `streamlit_component` 的目錄結構。
2. 到 https://share.streamlit.io/，選 **Create app**，選擇 GitHub 儲存庫及分支。將 **Main file path** 設為 `streamlit_app.py`。
3. 若要長期保存帳號與排行榜，準備 Streamlit Cloud 能連線且已啟用持久化的 Redis，然後從 **Advanced settings → Secrets** 貼上：

```toml
REDIS_URL = "rediss://使用者:密碼@雲端Redis主機:埠號/0"
REDIS_LEADERBOARD_KEY = "2048:cloud:leaderboard"
```

請使用服務商提供的 TLS 連線網址。上線後，兩種資料都存到這個 Redis。Windows 上的 `127.0.0.1:6379` 只能給本機使用。SQLite 和原本本機 Redis 的資料不會自動搬到雲端。

4. 按 **Deploy**。部署完成後，用取得的 `.streamlit.app` 網址測試訪客遊玩、註冊登入及排行榜。

未設定雲端 Redis 也能試玩。Community Cloud 的本機 SQLite 資料可能在應用程式重建後消失。
