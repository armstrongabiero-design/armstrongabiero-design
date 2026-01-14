"""
Email Service using SendGrid for Fleet Management System notifications
"""
import os
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.api_key = os.environ.get('SENDGRID_API_KEY')
        self.sender_email = os.environ.get('SENDER_EMAIL', 'noreply@fleethub.com')
        self.enabled = bool(self.api_key)
        if not self.enabled:
            logger.warning("SendGrid API key not configured. Email notifications disabled.")
    
    def send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Send an email using SendGrid"""
        if not self.enabled:
            logger.info(f"Email disabled. Would send to {to_email}: {subject}")
            return False
        
        try:
            message = Mail(
                from_email=self.sender_email,
                to_emails=to_email,
                subject=subject,
                html_content=html_content
            )
            sg = SendGridAPIClient(self.api_key)
            response = sg.send(message)
            logger.info(f"Email sent to {to_email}, status: {response.status_code}")
            return response.status_code == 202
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False
    
    def send_maintenance_request_notification(self, manager_email: str, request_data: dict) -> bool:
        """Notify fleet manager of new maintenance request"""
        subject = f"🔧 New Maintenance Request: {request_data.get('vehicle_registration', 'N/A')}"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">FleetHub - Maintenance Request</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p><strong>A new maintenance request requires your approval:</strong></p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Vehicle:</td>
                        <td style="padding: 10px;">{request_data.get('vehicle_registration', 'N/A')}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Driver:</td>
                        <td style="padding: 10px;">{request_data.get('driver_name', 'N/A')}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Request Type:</td>
                        <td style="padding: 10px;">{request_data.get('request_type', 'N/A')}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Priority:</td>
                        <td style="padding: 10px; color: {'#dc2626' if request_data.get('priority') == 'HIGH' else '#f59e0b' if request_data.get('priority') == 'MEDIUM' else '#22c55e'};">{request_data.get('priority', 'MEDIUM')}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold;">Description:</td>
                        <td style="padding: 10px;">{request_data.get('description', 'N/A')}</td>
                    </tr>
                </table>
                <p style="color: #6b7280; font-size: 14px;">Please log in to FleetHub to approve or reject this request.</p>
            </div>
        </body>
        </html>
        """
        return self.send_email(manager_email, subject, html_content)
    
    def send_request_status_notification(self, driver_email: str, request_data: dict, status: str, rejection_reason: str = None) -> bool:
        """Notify driver about request status update"""
        status_emoji = "✅" if status == "APPROVED" else "❌"
        status_color = "#22c55e" if status == "APPROVED" else "#dc2626"
        subject = f"{status_emoji} Maintenance Request {status}: {request_data.get('vehicle_registration', 'N/A')}"
        
        rejection_section = ""
        if rejection_reason:
            rejection_section = f"""
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; font-weight: bold;">Rejection Reason:</td>
                <td style="padding: 10px; color: #dc2626;">{rejection_reason}</td>
            </tr>
            """
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">FleetHub - Request Update</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <div style="text-align: center; padding: 20px;">
                    <span style="font-size: 48px;">{status_emoji}</span>
                    <h3 style="color: {status_color}; margin: 10px 0;">Request {status}</h3>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Vehicle:</td>
                        <td style="padding: 10px;">{request_data.get('vehicle_registration', 'N/A')}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Request Type:</td>
                        <td style="padding: 10px;">{request_data.get('request_type', 'N/A')}</td>
                    </tr>
                    {rejection_section}
                </table>
                <p style="color: #6b7280; font-size: 14px;">{'You can now proceed with the maintenance.' if status == 'APPROVED' else 'Please contact your fleet manager for more details.'}</p>
            </div>
        </body>
        </html>
        """
        return self.send_email(driver_email, subject, html_content)
    
    def send_pretrip_reminder(self, driver_email: str, driver_name: str, vehicle_registration: str) -> bool:
        """Send daily pre-trip checklist reminder"""
        subject = f"🚗 Pre-Trip Checklist Reminder - {vehicle_registration}"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">FleetHub - Daily Reminder</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Good morning, <strong>{driver_name}</strong>!</p>
                <p>Please complete your pre-trip vehicle inspection for <strong>{vehicle_registration}</strong> before starting your day.</p>
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                    <strong>Checklist Items:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Engine oil level</li>
                        <li>Tire condition & pressure</li>
                        <li>Brake functionality</li>
                        <li>Lights (headlights, indicators, brake lights)</li>
                        <li>Fuel level</li>
                        <li>Mirrors & wipers</li>
                        <li>Vehicle cleanliness/damage check</li>
                    </ul>
                </div>
                <p style="color: #dc2626; font-weight: bold;">You cannot log fuel or trips until the checklist is complete.</p>
                <p style="color: #6b7280; font-size: 14px;">Drive safely!</p>
            </div>
        </body>
        </html>
        """
        return self.send_email(driver_email, subject, html_content)
    
    def send_document_expiry_alert(self, email: str, document_data: dict) -> bool:
        """Alert about expiring document"""
        days_until_expiry = document_data.get('days_until_expiry', 0)
        subject = f"⚠️ Document Expiring Soon: {document_data.get('document_type', 'N/A')}"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">FleetHub - Document Alert</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <div style="text-align: center; padding: 20px;">
                    <span style="font-size: 48px;">⚠️</span>
                    <h3 style="color: #f59e0b;">Document Expiring in {days_until_expiry} Days</h3>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Document Type:</td>
                        <td style="padding: 10px;">{document_data.get('document_type', 'N/A')}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Entity:</td>
                        <td style="padding: 10px;">{document_data.get('entity_name', 'N/A')}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 10px; font-weight: bold;">Expiry Date:</td>
                        <td style="padding: 10px; color: #dc2626;">{document_data.get('expiry_date', 'N/A')}</td>
                    </tr>
                </table>
                <p style="color: #6b7280; font-size: 14px;">Please renew this document before it expires to avoid compliance issues.</p>
            </div>
        </body>
        </html>
        """
        return self.send_email(email, subject, html_content)
    
    def send_low_stock_alert(self, email: str, items: list) -> bool:
        """Alert about low stock items"""
        subject = f"📦 Low Stock Alert: {len(items)} items below reorder level"
        items_html = ""
        for item in items:
            items_html += f"""
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px;">{item.get('name', 'N/A')}</td>
                <td style="padding: 10px;">{item.get('sku', 'N/A')}</td>
                <td style="padding: 10px; color: #dc2626;">{item.get('quantity', 0)}</td>
                <td style="padding: 10px;">{item.get('reorder_level', 0)}</td>
            </tr>
            """
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">FleetHub - Inventory Alert</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>The following items are below their reorder levels:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <thead>
                        <tr style="background: #f3f4f6;">
                            <th style="padding: 10px; text-align: left;">Item</th>
                            <th style="padding: 10px; text-align: left;">SKU</th>
                            <th style="padding: 10px; text-align: left;">Current</th>
                            <th style="padding: 10px; text-align: left;">Reorder Level</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items_html}
                    </tbody>
                </table>
                <p style="color: #6b7280; font-size: 14px;">Please restock these items to avoid operational disruptions.</p>
            </div>
        </body>
        </html>
        """
        return self.send_email(email, subject, html_content)


# Singleton instance
email_service = EmailService()
