# Auth-Gated App Testing Playbook (Emergent Google Auth)

## Step 1: Create Test User & Session
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  nickname: null,
  total_points: 0, daily_points: 0, room_points: 0,
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```
(Use DB_NAME from /app/backend/.env instead of test_database if different.)

## Step 2: Test Backend API
```
curl -X GET "$API/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Step 3: Browser Testing
```
await page.context.add_cookies([{
    "name": "session_token", "value": "YOUR_SESSION_TOKEN",
    "domain": "<preview host>", "path": "/",
    "httpOnly": True, "secure": True, "sameSite": "None"
}])
await page.goto("https://<preview host>")
```

## Checklist
- User document has user_id field (custom UUID, MongoDB's _id is separate)
- Session user_id matches user's user_id exactly
- All queries use {"_id": 0} projection
- API returns user data with user_id field (not 401/404)
- Callback detection uses useLocation().hash, not window.location.hash

## Clean test data
```
mongosh --eval "
use('test_database');
db.users.deleteMany({email: /test\.user\./});
db.user_sessions.deleteMany({session_token: /test_session/});
"
```
