# How to Add a Script Tag to a Wix Website Page for Your Catalog

This guide provides updated instructions for adding a `<script>` tag to display a catalog on a specific page of your Wix website. Follow these steps carefully to ensure the catalog displays correctly.

## Prerequisites
- You have a `<script>` tag copied from our site (e.g., containing `data-affiliate` and `data-css` attributes).
- You have access to your Wix account and website editor.
- Ensure your Wix plan supports embedding custom code.

## Step-by-Step Instructions

1. **Log in to Wix**  
   Open your browser, navigate to [wix.com](https://www.wix.com), and sign in to your account.

2. **Open the Wix Editor**  
   From your Wix dashboard, select the website you want to edit. Click **Edit Site** to open the Wix Editor.

3. **Navigate to the Page**  
   In the Wix Editor, use the page menu (left sidebar) to select the specific page where you want the catalog to appear.

4. **Add a New Section**  
   - Click **Add** (or the `+` icon) in the left toolbar to add a new section to the page.  
   - Choose **Blank Section** to create a new section where the catalog will be displayed.  
   ![Wix Add Section](https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/wix-1.png)

5. **Add an Embed Code Element**  
   - In the new section, you’ll see options to get started. Select **Add Element**.  
   - From the element list, choose **Embed Code**.  
   - Click **Embedded HTML** to add an HTML embed element to the section.

6. **Paste the Script Tag**  
   - A code input box will appear for the embedded HTML.  
   - Paste the `<script>` tag (including the accompanying `<div>` tag, e.g., `<div id="madeira-container"></div><script data-affiliate="YOUR_ID" data-css="madeira-widget.css" src="https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/madeira-widget.js"></script>`) exactly as provided from our site into this box.  
   ![Wix Embed HTML](https://madeira-widget-bucket.s3.eu-west-2.amazonaws.com/wix-2.png)

7. **Apply and Display the Catalog**  
   - Click **Apply** or **Update** in the embed code panel to save the script.  
   - The catalog should now appear in the new section on your Wix page.

8. **Publish Your Website**  
   - In the Wix Editor, click **Publish** (top-right corner) to make your changes live.  
   - Visit the page to confirm the catalog displays correctly.

## Notes
- **Paste Accuracy**: Ensure the `<script>` tag and accompanying `<div>` are pasted exactly as provided, without modifications, to avoid errors.
- **Placement**: The catalog will appear in the section where you added the embedded HTML element. Adjust the section’s position or styling in the Wix Editor as needed.
- **Troubleshooting**: If the catalog doesn’t display, verify:
  - The `<script>` tag includes the correct `data-affiliate` and `data-css` attributes.
  - The page is published.
  - Your Wix plan supports custom code embedding (check with Wix Support if unsure).
- **Support**: For issues, contact our support team or the Wix Help Center.

---
*Last Updated: July 6, 2025*
