"""Casino-owned demo rankings, catalog details and persisted demo favourites."""
from casino_context_test import CasinoContextTests as Server


def check():
    for owner, expected in ((None, 400), ("bad", 400), ("CS-ffffffffffffffff", 403)):
        assert Server.request("games/ranking", owner)[0] == expected
    status, rank = Server.request("games/ranking?country=PL&minutes=60", Server.a)
    assert status == 200, rank
    assert rank["countryName"] == "Poland" and rank["metric"] == "bet_volume"
    assert rank["period"]["minutes"] == 60 and rank["demo"] is True
    assert rank["personalized"] is False
    games = Server.request("games", Server.a)[1]["items"]
    enabled = {game["id"] for game in games if game["enabled"]}
    assert set(row["gameId"] for row in rank["items"]) == enabled
    assert all(game["image"].startswith("data:image/") and "badges" in game for game in games)
    assert Server.request("games/ranking?mode=personal&player=demo-check&country=BR&minutes=4320", Server.a)[1]["personalized"] is True
    for query in ("minutes=0", "minutes=bad", "mode=unknown", "country=bad", "player=real-user"):
        assert Server.request("games/ranking?" + query, Server.a)[0] == 422
    game_id = rank["items"][0]["gameId"]
    path = "games/demo-favourites?player=demo-check"
    status, saved = Server.request(path, Server.a, "POST", {"gameId": game_id, "favourite": True})
    assert status == 200, saved
    assert saved["items"] == [{"gameId": game_id}]
    assert Server.request(path, Server.b)[1]["items"] == []
    assert Server.request("games/demo-favourites", Server.a)[0] == 422
    assert Server.request(path, Server.b, "POST", {"gameId": game_id, "favourite": True})[0] == 422
    Server.stop()
    Server.start()
    assert Server.request(path, Server.a)[1]["items"] == [{"gameId": game_id}]
    assert Server.request(path, Server.a, "POST", {"gameId": game_id, "favourite": False})[1]["items"] == []
    print("Popular CRM: geo/personal metadata, catalogue, tenant isolation, validation and favourite persistence passed.")


if __name__ == "__main__":
    Server.setUpClass()
    try:
        check()
    finally:
        Server.tearDownClass()
