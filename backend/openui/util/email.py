import subprocess


def get_git_user_email():
    try:
        # Run the git command to get the email
        result = subprocess.run(
            ["git", "config", "--global", "user.email"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        email = result.stdout.strip()
        return email
    except subprocess.CalledProcessError:
        return None
