# Backend Scripts - User Management

This folder contains utility scripts for managing the Nearby Nearby Admin Portal backend.

## Overview

This document describes how to manage users in the Nearby Nearby Admin Portal database.

## Test User Created ✅
A test user has been created with the following credentials:
- **Email**: `test@nearbynearby.com`
- **Password**: `1234`
- **Role**: `admin`

## Available Scripts

### `fix_event_timezones.py`
Issue #180 data fix: corrects event rows whose times were stored wrong by the
old timezone-naive admin form (a 7 PM Eastern entry stored as 19:00Z). It
reinterprets the stored UTC wall clock as America/New_York wall time for
`start_datetime`, `end_datetime`, `recurrence_end_date`, and
`vendor_application_deadline`. Default mode is a dry run that changes nothing;
`--apply` requires an explicit `--ids` list so a blanket second run cannot
shift the same rows twice (events written through the reschedule modal carry
real offsets and must NOT be corrected).

**Usage:**
```bash
cd backend/scripts

# Dry run over ALL events: prints current vs corrected values (UTC and Eastern)
python fix_event_timezones.py

# Dry run for specific events only
python fix_event_timezones.py --ids <poi_id> [<poi_id> ...]

# Apply the correction to ONLY the listed events, in one transaction
python fix_event_timezones.py --apply --ids <poi_id> [<poi_id> ...]
```

**Before touching prod:** take a manual RDS snapshot first (see the
"Production Deployment" section of the root CLAUDE.md). Run it in prod as an
ECS `run-task` on the admin task def with a `command` override, the same
pattern the embedding backfill uses (see the "Embedding / Semantic Search"
section of the root CLAUDE.md). Read the dry-run output and pick ids before
applying.

### `manage_users.py`
Comprehensive user management script with multiple commands.

**Usage:**
```bash
cd backend/scripts
python manage_users.py [command] [options]
```

**Commands:**
- `create <email> <password> [--role <role>]` - Create a new user
- `list` - List all users in the database with formatted output
- `delete <email>` - Delete a user by email
- `test-user` - Create the test user (test@nearbynearby.com / 1234)

**Examples:**
```bash
# Create a new admin user
python manage_users.py create admin@example.com mypassword123 --role admin

# List all users (formatted table output)
python manage_users.py list

# Delete a user
python manage_users.py delete user@example.com

# Create test user
python manage_users.py test-user
```

## Running Scripts

### From the scripts folder:
```bash
cd backend/scripts
python manage_users.py [command]
```

### From the backend folder:
```bash
cd backend
python scripts/manage_users.py [command]
```

### From the project root:
```bash
cd backend/scripts
python manage_users.py [command]
```

### Using Docker (Recommended):
```bash
# Make sure containers are running
docker-compose up -d

# Run scripts inside the backend container
docker-compose exec backend python scripts/manage_users.py list
docker-compose exec backend python scripts/manage_users.py test-user
```

## User Model

The User model includes the following fields:
- `id` (UUID, primary key)
- `email` (String, unique, indexed)
- `hashed_password` (String, bcrypt hashed)
- `role` (String, default: "admin")
- `created_at` (Timestamp, auto-generated)

## Authentication Flow

1. **Login**: Users authenticate via `/api/v1/auth/login` endpoint
2. **Token**: JWT token is returned and stored in frontend
3. **Authorization**: Token is included in `Authorization: Bearer <token>` header
4. **Validation**: Backend validates token and extracts user email

## Security Notes

- Passwords are hashed using bcrypt
- JWT tokens have expiration (configurable in `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Email addresses must be unique
- Role-based access control is available (admin, user)
- Input validation prevents invalid roles

## Features

### Enhanced User Feedback
- ✅ Success messages with user details and ID
- ❌ Clear error messages with troubleshooting tips
- 📋 Formatted table output for user listings

### Error Handling
- Duplicate user detection with clear messages
- Input validation for email, password, and role
- Database connection error handling with solutions
- Graceful rollback on database errors

### User Management Capabilities
- Create users with custom roles (admin/user)
- List all users with creation timestamps in formatted table
- Delete users by email with confirmation
- Test user creation for development

## Testing the Login

You can now test the login with the created user:

1. **Frontend**: Navigate to the login page
2. **Credentials**: 
   - Email: `test@nearbynearby.com`
   - Password: `1234`
3. **Expected**: Successful login and access to admin panel

## Requirements

- Backend dependencies installed
- Database running and accessible
- Environment variables configured (if needed)

## Troubleshooting

### Common Issues:

1. **"User already exists"**: The user was already created
2. **Database connection errors**: 
   - Ensure Docker containers are running: `docker-compose up -d`
   - Run scripts inside Docker: `docker-compose exec backend python scripts/manage_users.py list`
3. **Import errors**: Make sure you're running from the `backend` directory
4. **Bcrypt warnings**: These are harmless version compatibility warnings

### Import Errors
If you get import errors, make sure you're running from the correct directory:
- The scripts are designed to be run from the `backend/scripts/` folder
- They automatically add the parent directory to the Python path

### Database Connection Errors
- Ensure the database is running
- Check that the database connection settings are correct
- Verify that the database schema is up to date
- **Recommended**: Run scripts inside Docker container using `docker-compose exec backend`

### Permission Errors
- Make sure you have write permissions to the database
- Check that the database user has the necessary privileges

### Common Solutions:
1. **Docker approach (recommended)**:
   ```bash
   docker-compose up -d
   docker-compose exec backend python scripts/manage_users.py list
   ```

2. **Local environment**:
   Create a `.env` file in the backend directory with:
   ```
   DATABASE_URL=postgresql://nearby:nearby@localhost/nearbynearby
   ```

### Reset Test User:
If you need to recreate the test user:
```bash
python manage_users.py delete test@nearbynearby.com
python manage_users.py test-user
```

### Docker Troubleshooting:
If you get database connection errors when running locally:

1. **Use Docker approach (recommended)**:
   ```bash
   docker-compose up -d
   docker-compose exec backend python scripts/manage_users.py list
   ```

2. **Set up local environment**:
   Create a `.env` file in the backend directory with:
   ```
   DATABASE_URL=postgresql://nearby:nearby@localhost/nearbynearby
   ```

### Database Credentials

The database uses these credentials (defined in docker-compose.yml):
- **Username**: `nearby`
- **Password**: `nearby`
- **Database**: `nearbynearby`
- **Host**: `db` (inside Docker) or `localhost` (outside Docker)
- **Port**: `5432` 