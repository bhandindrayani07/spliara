# Spliara — Database Schema

## 1. Overview

Spliara uses PostgreSQL to store user accounts, expense groups, group memberships, shared expenses, expense splits and settlements.

## 2. Database Tables

### Table 1: Users

Stores registered user information.

| Column | Data Type | Constraints |
|---|---|---|
| user_id | UUID | Primary Key |
| name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | TEXT | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### Table 2: Groups

Stores expense-sharing groups.

| Column | Data Type | Constraints |
|---|---|---|
| group_id | UUID | Primary Key |
| group_name | VARCHAR(100) | NOT NULL |
| description | TEXT | Optional |
| created_by | UUID | Foreign Key → Users |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### Table 3: Group_Members

Connects users with their expense groups.

| Column | Data Type | Constraints |
|---|---|---|
| group_member_id | UUID | Primary Key |
| group_id | UUID | Foreign Key → Groups |
| user_id | UUID | Foreign Key → Users |
| joined_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Constraint:** UNIQUE(group_id, user_id) prevents duplicate memberships.

### Table 4: Expenses

Stores shared expenses added to a group.

| Column | Data Type | Constraints |
|---|---|---|
| expense_id | UUID | Primary Key |
| group_id | UUID | Foreign Key → Groups |
| paid_by | UUID | Foreign Key → Users |
| description | VARCHAR(255) | NOT NULL |
| amount | DECIMAL(12,2) | NOT NULL, greater than 0 |
| category | VARCHAR(50) | NOT NULL |
| expense_date | DATE | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### Table 5: Expense_Splits

Stores each member's share of an expense.

| Column | Data Type | Constraints |
|---|---|---|
| split_id | UUID | Primary Key |
| expense_id | UUID | Foreign Key → Expenses |
| user_id | UUID | Foreign Key → Users |
| share_amount | DECIMAL(12,2) | NOT NULL |
| paid_amount | DECIMAL(12,2) | DEFAULT 0 |

**Rules:**
- Equal splitting divides the expense equally among selected members.
- Custom splitting allows different amounts for different members.
- Total share amounts must equal the expense amount.
- Each user can have only one split record per expense.

### Table 6: Settlements

Records repayments between group members.

| Column | Data Type | Constraints |
|---|---|---|
| settlement_id | UUID | Primary Key |
| group_id | UUID | Foreign Key → Groups |
| paid_by | UUID | Foreign Key → Users |
| received_by | UUID | Foreign Key → Users |
| amount | DECIMAL(12,2) | NOT NULL, greater than 0 |
| settlement_date | DATE | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## 3. Table Relationships

- One user can create multiple groups.
- One group can have multiple members.
- One user can belong to multiple groups.
- One group can contain multiple expenses.
- One user can pay multiple expenses.
- One expense can have multiple expense splits.
- One user can have multiple expense splits.
- One group can have multiple settlements.

## 4. Important Business Rules

1. Only group members can participate in that group's expenses.
2. The payer must be a member of the relevant group.
3. Every expense must have valid split records.
4. The sum of shares must equal the total expense amount.
5. Settlement amounts must be greater than zero.
6. A user cannot settle an expense with themselves.
7. All financial calculations use decimal values to avoid floating-point errors.

## 5. Database Technology

- Database: PostgreSQL
- Primary Keys: UUID
- Foreign Keys: Maintain relationships between tables.
- Constraints: Maintain data integrity.
- Passwords: Store securely hashed passwords, never plain-text passwords.

## 6. Future Extensions

- Group invitations
- Receipt attachments
- Recurring expenses
- Notifications and reminders
- Expense activity history

