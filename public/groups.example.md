# Group CSV Import

Use this CSV after students have created accounts and joined the course.

Each row creates or updates one assignment group and can attach a GitHub repository.

## Format

With an explicit group name:

```csv
|Team Alpha|{khed3455@mylaurier.ca:koushik255}{koushikkheda217@gmail.com:koushiktwice}|https://github.com/koushik255/testingtesting|
```

Without a group name, Miyagi uses the GitHub repo name:

```csv
|{khed3455@mylaurier.ca:koushik255}{koushikkheda217@gmail.com:koushiktwice}|https://github.com/koushik255/testingtesting|
```

## Member syntax

```txt
{student-email-or-id:github-username}
```

Example:

```txt
{khed3455@mylaurier.ca:koushik255}
```

## Columns

1. Optional group name
2. Group members
3. GitHub repository URL

## Notes

- Student accounts must already exist.
- Use the email or student ID that identifies the student account.
- GitHub usernames are used to match commits to students.
- One row equals one group.
