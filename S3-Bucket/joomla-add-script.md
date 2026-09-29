# How to Add a Script Tag to a Joomla Website Page

This guide explains how to copy and paste a &lt;script&gt; tag into a specific page on your Joomla website. Follow these steps carefully to ensure the script works correctly.

## Prerequisites
- You have a &lt;script&gt; tag copied from our site.
- You have access to your Joomla administrator account.

## Step-by-Step Instructions

1. **Log in to Joomla Admin Panel**  
   Open your browser, go to your site's admin URL (e.g., yoursite.com/administrator), and sign in.

2. **Navigate to the Article Manager**  
   In the Joomla dashboard, click **Content** > **Articles** in the left menu.

3. **Select or Create the Article**  
   Find the article (page) where you want to add the script. Click its title to edit, or click **New** to create a new article.

4. **Switch to HTML Mode**  
   In the article editor, locate the **Toggle Editor** button (usually below the editor) or an **HTML** button/tab. Click it to switch to HTML mode.

5. **Paste the Script Tag**  
   Paste the copied &lt;script&gt; tag into the desired location in the HTML code (e.g., before or after content). Ensure it’s within the article’s body.

6. **Check Editor Security Settings**  
   - Go to **Extensions** > **Plugins**, find **Editor - TinyMCE**, and click it.  
   - In **Prohibited Elements**, remove "script" if listed. Save changes.  
   - Go to **Content** > **Articles** > **Options** (top-right). In **Text Filters**, set your user group (e.g., Super Users) to **No Filtering**. Save.

7. **Save the Article**  
   Click **Save** or **Save & Close** to save your changes.

8. **Publish and Check**  
   Ensure the article is published (check the status). Visit the page on your live site to confirm the script is working.

## Notes
- Ensure the &lt;script&gt; tag is pasted exactly as provided, without modifications.
- If the script doesn’t work, verify HTML mode was used and security settings allow scripts.
- For issues, contact our support team or Joomla documentation.

---
*Last Updated: June 1, 2025*