# Spliara — Split smart.

## Project Overview

Spliara is a personal finance and shared-expense management platform. It helps individuals track their own income and spending while allowing friends, roommates, families and travel groups to manage shared expenses, split bills fairly and track settlements. Both experiences are available through one dashboard, with personal and group transactions kept separate.

## User Roles

1. **Registered User:** Manages personal finances and participates in expense groups.
2. **Group Member:** Views group expenses, participates in bill splitting and checks balances.
3. **Group Creator:** Creates groups, manages members and oversees shared expenses.

## MVP Features

### 1. Authentication
- User signup, login and logout.
- Secure password hashing.
- User profile management.

### 2. Personal Expense Tracker
- Add, edit and delete personal income and expenses.
- Categorise transactions.
- Set monthly budgets.
- View transaction history.
- Search and filter transactions.
- View spending analytics and monthly summaries.

### 3. Group Expense Management
- Create, edit and delete groups.
- Add and manage group members.
- Add, edit and delete shared expenses.
- Select who paid for an expense.
- Split expenses equally or using custom amounts.
- Calculate who owes whom.
- Record settlements and view settlement history.
- Search and filter group expenses.

### 4. Unified Dashboard
- View personal and group expense summaries.
- Access both modules separately.
- View recent transactions and balances.

## Future Features

- Smart debt simplification.
- Receipt scanning using OCR.
- Recurring expenses.
- Group budgets and alerts.
- Trip expense mode.
- PDF and CSV reports.
- Payment reminders.
- Advanced spending analytics.
- AI-powered spending insights.
- Mobile application using React Native and Expo.

## Technology Stack

- Frontend: React.js and CSS
- Backend: Node.js and Express.js
- Database: PostgreSQL
- Authentication: JWT and bcrypt
- API Testing: Postman
- Version Control: Git and GitHub
- Deployment: Vercel and a suitable backend hosting provider

## Main Modules

1. Authentication
2. User Profile
3. Unified Dashboard
4. Personal Expense Tracker
5. Group Management
6. Shared Expense Management
7. Expense Splitting
8. Balance Management
9. Settlements
10. Search and Analytics

## Data Separation Rule

Personal transactions and group transactions must be stored and calculated separately. Shared expenses must not be counted twice in personal spending summaries.

## Project Goal

Build a responsive, secure and user-friendly finance platform combining personal expense tracking and group expense sharing, with a reusable backend that can later support a mobile application.