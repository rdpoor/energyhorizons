![Database](^/database.png?size=small)

The database functionality in [Dataforge]({{DohballDocs:dataforge}}) helps you work with data in both Node.js and browser environments. It uses SQLite for Node.js and alasql for browsers, making it easier to store and retrieve data consistently across platforms.

This guide covers:
* Basic database operations and table management
* Working with data using CRUD operations
* Managing database connections and transactions
* Using property indexing for better performance
* Writing custom queries and searches
* Best practices for cross-environment compatibility

## Overview

The database functionality in Dataforge provides:
- **Synchronous database operations by default** (no need for async/await)
- Cross-environment compatibility (Node.js and browser, though browser support is currently in beta)
- Transaction support
- JSON storage capabilities
- Property indexing
- Type-safe database operations

## Important: Synchronous vs Asynchronous Operations

**Database operations in Dataforge are synchronous by default.** This is a key difference from many other database libraries that use async patterns.

```javascript
// CORRECT: Synchronous database usage - NO await needed
let df = New('Dataforge');
let result = df.forge(data, [
    {SelectDB: "myDatabase"},
    {ReplaceIntoDB: "myDatabase.users"}
]);
console.log(result); // Available immediately
```

```javascript
// INCORRECT: Don't use async/await for standard database operations
// This is unnecessary and may cause confusion
let df = New('Dataforge');
let result = await df.forge(data, [ // unnecessary await
    {SelectDB: "myDatabase"},
    {ReplaceIntoDB: "myDatabase.users"}
]);
```

**When to use AsyncDataforge:** Only use `AsyncDataforge` when your data pipeline includes truly asynchronous operations like HTTP requests (`Fetch`, `Post`) or other I/O operations. The database commands themselves work identically in both `Dataforge` and `AsyncDataforge` patterns.

## Database Commands

### Database Selection and Management

#### `SelectDB`
Selects or creates a database for subsequent operations.
Crucially to browsers, this also Attaches the database at it's name. This is because alasql doesn't support opening by filename, meaning there is no default database we can rely on. The solution is to always references tables by their database name (dbname.tablename).

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"}
]);
```

In Node.js, this creates/opens an SQLite database in the `/dbs` directory. In browsers, it uses alasql with localStorage persistence.

#### `CloseDB`
Closes the current database connection.

```javascript
let df = New('Dataforge');
df.forge(null, ["CloseDB"]);
```

### Table Operations

#### `CreateTableInDB`
Creates a new table with specified schema.

Basic table creation (id/data columns):
```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {CreateTableInDB: "myDatabase.users"}
]);
```

Custom schema:
```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {CreateTableInDB: ["myDatabase.customTable", {
        id: "TEXT PRIMARY KEY",
        name: "TEXT",
        age: "INTEGER"
    }]}
]);
```

#### `TruncateTableInDB`
Removes all records from a table.

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {TruncateTableInDB: "myDatabase.users"}
]);
```

### Data Operations

#### `ReplaceIntoDB`
Inserts or updates a record in the database.

```javascript
let df = New('Dataforge');
df.forge({
    id: "user1",
    name: "John",
    age: 30
}, [
    {SelectDB: "myDatabase"},
    {ReplaceIntoDB: "myDatabase.users"}
]);
```

#### `SelectIdeaFromDB`
Retrieves a specific record by ID.

```javascript
let df = New('Dataforge');
let result = df.forge(null, [
    {SelectDB: "myDatabase"},
    {SelectIdeaFromDB: ["myDatabase.users", "user1"]}
]);
console.log(result); // Available immediately, no await needed
```

#### `SelectAllIdeasFromDB`
Retrieves all records from a table.

```javascript
let df = New('Dataforge');
let allUsers = df.forge(null, [
    {SelectDB: "myDatabase"},
    {SelectAllIdeasFromDB: "myDatabase.users"}
]);
console.log(allUsers); // Array of all users, available immediately
```

#### `DeleteIdeaFromDB`
Removes a specific record by ID.

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {DeleteIdeaFromDB: ["myDatabase.users", "user1"]}
]);
```

### Property Operations

#### `IndexPropertyInDB`
Creates an index on a JSON property within the data column.

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {IndexPropertyInDB: ["myDatabase.users", "name"]}
]);
```

#### `SelectIdeaPropertyFromDB`
Retrieves a specific property from a record.

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {SelectIdeaPropertyFromDB: ["myDatabase.users", "user1", "name"]}
]);
```

#### `SelectIdeaByPropertyFromDB`
Finds records where a property matches a specific value.

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {SelectIdeaByPropertyFromDB: ["myDatabase.users", "name", "John"]}
]);
```

### Query Operations

#### `QueryDB`
Executes a custom SQL query with optional parameters.

```javascript
let df = New('Dataforge');
let results = df.forge(null, [
    {SelectDB: "myDatabase"},
    {QueryDB: [
        "SELECT * FROM myDatabase.users WHERE age > ?",
        [21]
    ]}
]);
// Results available immediately, no await needed
```

#### `RunInDB`
Executes a SQL statement that doesn't return results (DDL, DML).

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {RunInDB: [
        "UPDATE myDatabase.users SET age = age + 1 WHERE id = ?",
        ["user1"]
    ]}
]);
```

#### `SearchInDB`
Performs a text search on a specific property.

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    {SearchInDB: ["myDatabase.users", "Jo", "name"]}
]);
```

### Transaction Management

#### `StartTransactionInDB`
Begins a database transaction.

```javascript
let df = New('Dataforge');
df.forge(null, [
    {SelectDB: "myDatabase"},
    "StartTransactionInDB",
    // ... operations in transaction
    {EndTransactionInDB: true} // commit
]);
```

#### `EndTransactionInDB`
Ends a transaction with commit or rollback.

```javascript
let df = New('Dataforge');
// Commit
df.forge(null, [{EndTransactionInDB: true}]);

// Rollback
df.forge(null, [{EndTransactionInDB: false}]);
```

## Best Practices

1. **Understanding Synchronous Operations**
   - Remember that database operations are synchronous by default
   - No need for async/await with standard database operations
   - Use `Dataforge` for most database work, `AsyncDataforge` only when mixing with HTTP requests or other async operations

2. **Connection Management**
   - Always close database connections when done
   - Use transactions for multiple related operations
   - Keep connections open only as long as needed

3. **Data Storage**
   - Use JSON for complex data structures
   - Index frequently queried properties
   - Consider using custom schemas for performance-critical tables

4. **Error Handling**
   - Wrap database operations in try-catch blocks
   - Use transactions for operations that must be atomic
   - Check operation results before proceeding

5. **Cross-Environment Compatibility**
   - Test database operations in both Node.js and browser environments
   - Be aware of SQLite vs alasql syntax differences
   - Use standard SQL features when possible

## Example Workflow

Here's a complete example showing a typical database workflow:

```javascript
let df = New('Dataforge');

// All operations below are synchronous - no await needed
let results = df.forge(null, [
    // Select database
    {SelectDB: "myApp"},
    
    // Create table
    {CreateTableInDB: "myApp.users"},
    
    // Start transaction
    "StartTransactionInDB",
    
    // Insert some data
    {ReplaceIntoDB: ["myApp.users", {
        id: "user1",
        data: JSON.stringify({
            name: "John Doe",
            email: "john@example.com",
            preferences: {
                theme: "dark",
                notifications: true
            }
        })
    }]},
    
    // Create an index
    {IndexPropertyInDB: ["myApp.users", "name"]},
    
    // Commit transaction
    {EndTransactionInDB: true},
    
    // Query the data
    {SearchInDB: ["myApp.users", "John", "name"]},
    
    // Close the connection
    "CloseDB"
]);

console.log(results); // Results available immediately
```

## Environment-Specific Notes

### Bun/Node.js (SQLite)
- Uses Bun.sqlite or better-sqlite3 for database operations
- Files stored in `/dbs` directory
- Supports WAL journal mode
- Full SQL capabilities

### Browser (alasql)
- Uses localStorage for persistence
- Limited SQL feature set
- In-memory operations with periodic storage
- Simplified JSON handling

## When to Use AsyncDataforge with Database Operations

If your workflow combines database operations with truly asynchronous operations (like HTTP requests, file operations, or timed operations), use `AsyncDataforge`:

```javascript
// Using AsyncDataforge when mixing with truly async operations
let adf = New('AsyncDataforge');
let result = await adf.forge(null, [
    {SelectDB: "myDatabase"},
    {SelectAllIdeasFromDB: "myDatabase.users"},
    // Now doing something that actually requires async
    {Fetch: "/api/external-data"},
    // Process combined data...
]);
```

Remember: The database operations themselves are still synchronous internally, even when used within an AsyncDataforge pipeline.