"""
Email Service using Resend for GTI Fleet Solutions notifications
"""
import os
import logging
import resend

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.api_key = os.environ.get('RESEND_API_KEY')
        self.sender_email = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
        self.enabled = bool(self.api_key)
        
        if self.enabled:
            resend.api_key = self.api_key
            logger.info("Resend email service configured successfully")
        else:
            logger.warning("Resend API key not configured. Email notifications disabled.")
    
    def send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Send an email using Resend"""
        if not self.enabled:
            logger.info(f"Email disabled. Would send to {to_email}: {subject}")
            return False
        
        try:
            params = {
                "from": f"GTI Fleet Solutions <{self.sender_email}>",
                "to": [to_email],
                "subject": subject,
                "html": html_content
            }
            response = resend.Emails.send(params)
            logger.info(f"Email sent to {to_email}, id: {response.get('id', 'unknown')}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False
    
    def send_maintenance_request_notification(self, manager_email: str, request_data: dict) -> bool:
        """Notify fleet manager of new maintenance request"""
        subject = f"New Maintenance Request: {request_data.get('vehicle_registration', 'N/A')}"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Maintenance Request</h2>
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
                <p style="color: #6b7280; font-size: 14px;">Please log in to GTI Fleet Solutions to approve or reject this request.</p>
            </div>
        </body>
        </html>
        """
        return self.send_email(manager_email, subject, html_content)
    
    def send_request_status_notification(self, driver_email: str, request_data: dict, status: str, rejection_reason: str = None) -> bool:
        """Notify driver about request status update"""
        status_emoji = "✅" if status == "APPROVED" else "❌"
        status_color = "#22c55e" if status == "APPROVED" else "#dc2626"
        subject = f"Maintenance Request {status}: {request_data.get('vehicle_registration', 'N/A')}"
        
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
                <h2 style="margin: 0;">GTI Fleet Solutions - Request Update</h2>
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
    
    def send_password_reset_email(self, email: str, reset_link: str, user_name: str) -> bool:
        """Send password reset email"""
        subject = "GTI Fleet Solutions - Password Reset Request"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #e3aa27, #c4912a); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Password Reset</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Hello <strong>{user_name}</strong>,</p>
                <p>We received a request to reset your password for your GTI Fleet Solutions account.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" style="background: linear-gradient(135deg, #e3aa27, #c4912a); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        Reset Password
                    </a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
                <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">{reset_link}</p>
                
                <div style="background: #fef3c7; border-left: 4px solid #e3aa27; padding: 15px; margin: 20px 0;">
                    <strong>Important:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>This link will expire in 1 hour</li>
                        <li>If you didn't request this, please ignore this email</li>
                        <li>Your password won't change until you create a new one</li>
                    </ul>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">If you need help, contact your system administrator.</p>
            </div>
        </body>
        </html>
        """
        return self.send_email(email, subject, html_content)
    
    def send_otp_email(self, email: str, user_name: str, otp_code: str) -> bool:
        """Send OTP verification email for Group Fleet Manager login"""
        subject = "GTI Fleet Solutions - Login Verification Code"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #e3aa27, #c4912a); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Login Verification</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Hello <strong>{user_name}</strong>,</p>
                <p>You are logging in as a <strong>Group Fleet Manager</strong>. For your security, please use the verification code below to complete your login:</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <div style="background: #fef8eb; border: 2px dashed #e3aa27; padding: 20px; border-radius: 8px; display: inline-block;">
                        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #c4912a;">{otp_code}</div>
                    </div>
                </div>
                
                <div style="background: #fef3c7; border-left: 4px solid #e3aa27; padding: 15px; margin: 20px 0;">
                    <strong>Security Notice:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>This code expires in <strong>5 minutes</strong></li>
                        <li>Never share this code with anyone</li>
                        <li>If you didn't request this, please secure your account immediately</li>
                    </ul>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">If you did not attempt to log in, please contact your system administrator immediately.</p>
            </div>
        </body>
        </html>
        """
        return self.send_email(email, subject, html_content)
    
    def send_document_expiry_alert(self, email: str, document_data: dict) -> bool:
        """Alert about expiring document"""
        days_until_expiry = document_data.get('days_until_expiry', 0)
        subject = f"Document Expiring Soon: {document_data.get('document_type', 'N/A')}"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Document Alert</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <div style="text-align: center; padding: 20px;">
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
    
    def send_daily_fleet_report(self, email: str, report_data: dict) -> bool:
        """Send daily fleet status report to Group Fleet Manager"""
        subject = f"GTI Fleet Daily Report - {report_data.get('date', 'Today')}"
        
        # Build alerts section
        alerts_html = ""
        alerts = report_data.get('alerts', [])
        if alerts:
            for alert in alerts[:10]:
                severity_color = '#dc2626' if alert.get('severity') == 'CRITICAL' else '#f59e0b' if alert.get('severity') == 'WARNING' else '#3b82f6'
                alerts_html += f"""
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 8px; color: {severity_color}; font-weight: bold;">{alert.get('severity', 'INFO')}</td>
                    <td style="padding: 8px;">{alert.get('title', 'N/A')}</td>
                    <td style="padding: 8px;">{alert.get('country', 'All')}</td>
                </tr>
                """
        else:
            alerts_html = '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #22c55e;">No active alerts</td></tr>'
        
        compliance = report_data.get('compliance', {})
        compliance_rate = compliance.get('compliance_rate', 100)
        compliance_color = '#22c55e' if compliance_rate >= 80 else '#f59e0b' if compliance_rate >= 60 else '#dc2626'
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Daily Report</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">{report_data.get('date', 'Today')} | Ghana - Liberia - Sao Tome</p>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
                
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Fleet Overview</h3>
                <table style="width: 100%; margin-bottom: 20px;">
                    <tr>
                        <td style="padding: 15px; background: #f3f4f6; border-radius: 8px; text-align: center; width: 25%;">
                            <div style="font-size: 28px; font-weight: bold; color: #6366f1;">{report_data.get('total_vehicles', 0)}</div>
                            <div style="color: #6b7280; font-size: 12px;">Total Vehicles</div>
                        </td>
                        <td style="width: 10px;"></td>
                        <td style="padding: 15px; background: #f3f4f6; border-radius: 8px; text-align: center; width: 25%;">
                            <div style="font-size: 28px; font-weight: bold; color: #22c55e;">{report_data.get('active_vehicles', 0)}</div>
                            <div style="color: #6b7280; font-size: 12px;">Active</div>
                        </td>
                        <td style="width: 10px;"></td>
                        <td style="padding: 15px; background: #f3f4f6; border-radius: 8px; text-align: center; width: 25%;">
                            <div style="font-size: 28px; font-weight: bold; color: #3b82f6;">{report_data.get('total_drivers', 0)}</div>
                            <div style="color: #6b7280; font-size: 12px;">Drivers</div>
                        </td>
                        <td style="width: 10px;"></td>
                        <td style="padding: 15px; background: #f3f4f6; border-radius: 8px; text-align: center; width: 25%;">
                            <div style="font-size: 28px; font-weight: bold; color: #f59e0b;">{report_data.get('pending_maintenance', 0)}</div>
                            <div style="color: #6b7280; font-size: 12px;">Pending Maint.</div>
                        </td>
                    </tr>
                </table>
                
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Compliance Status</h3>
                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <div style="font-size: 48px; font-weight: bold; color: {compliance_color};">{compliance_rate}%</div>
                    <div style="color: #6b7280;">Overall Compliance Rate</div>
                </div>
                
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Active Alerts ({report_data.get('alert_count', 0)})</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #f3f4f6;">
                            <th style="padding: 10px; text-align: left;">Severity</th>
                            <th style="padding: 10px; text-align: left;">Alert</th>
                            <th style="padding: 10px; text-align: left;">Country</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alerts_html}
                    </tbody>
                </table>
                
            </div>
            <div style="padding: 15px; background: #f3f4f6; border-radius: 0 0 8px 8px; text-align: center; color: #6b7280; font-size: 12px;">
                This is an automated report from GTI Fleet Solutions.
            </div>
        </body>
        </html>
        """
        return self.send_email(email, subject, html_content)


# Singleton instance
email_service = EmailService()
