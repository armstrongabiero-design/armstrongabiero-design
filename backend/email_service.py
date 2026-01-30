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
        self.sender_email = os.environ.get('SENDER_EMAIL', 'noreply@gtifleet.com')
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
    
    def send_pretrip_reminder(self, driver_email: str, driver_name: str, vehicle_registration: str) -> bool:
        """Send daily pre-trip checklist reminder"""
        subject = f"🚗 Pre-Trip Checklist Reminder - {vehicle_registration}"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Daily Reminder</h2>
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
                <h2 style="margin: 0;">GTI Fleet Solutions - Document Alert</h2>
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
                <h2 style="margin: 0;">GTI Fleet Solutions - Inventory Alert</h2>
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

    def send_daily_fleet_report(self, email: str, report_data: dict) -> bool:
        """Send daily fleet status report to Group Fleet Manager"""
        subject = f"📊 GTI Fleet Daily Report - {report_data.get('date', 'Today')}"
        
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
            alerts_html = '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #22c55e;">✓ No active alerts</td></tr>'
        
        # Build compliance section
        compliance = report_data.get('compliance', {})
        compliance_rate = compliance.get('compliance_rate', 100)
        compliance_color = '#22c55e' if compliance_rate >= 80 else '#f59e0b' if compliance_rate >= 60 else '#dc2626'
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Daily Report</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">{report_data.get('date', 'Today')} | Ghana • Liberia • São Tomé</p>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
                
                <!-- Fleet Overview -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">📊 Fleet Overview</h3>
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
                
                <!-- Compliance -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">✅ Compliance Status</h3>
                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                    <div style="font-size: 48px; font-weight: bold; color: {compliance_color};">{compliance_rate}%</div>
                    <div style="color: #6b7280;">Overall Compliance Rate</div>
                    <div style="margin-top: 10px; font-size: 14px;">
                        <span style="color: #22c55e;">✓ {compliance.get('compliant', 0)} Compliant</span> | 
                        <span style="color: #f59e0b;">⚠ {compliance.get('warning', 0)} Warning</span> | 
                        <span style="color: #dc2626;">✗ {compliance.get('non_compliant', 0)} Non-Compliant</span>
                    </div>
                </div>
                
                <!-- Pending Approvals -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">📋 Pending Actions</h3>
                <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <strong>{report_data.get('pending_requests', 0)}</strong> maintenance requests awaiting your approval<br>
                    <strong>{report_data.get('pending_users', 0)}</strong> user registrations pending approval
                </div>
                
                <!-- Active Alerts -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🔔 Active Alerts ({report_data.get('alert_count', 0)})</h3>
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
                
                <!-- Costs -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">💰 Cost Summary (GHS)</h3>
                <table style="width: 100%; margin-bottom: 20px;">
                    <tr>
                        <td style="padding: 10px;">Total Maintenance Cost:</td>
                        <td style="padding: 10px; text-align: right; font-weight: bold;">GH₵ {report_data.get('maintenance_cost_ghs', 0):,.2f}</td>
                    </tr>
                    <tr style="background: #f3f4f6;">
                        <td style="padding: 10px;">Total Fuel Cost (USD):</td>
                        <td style="padding: 10px; text-align: right; font-weight: bold;">$ {report_data.get('fuel_cost_usd', 0):,.2f}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px;">Exchange Rate:</td>
                        <td style="padding: 10px; text-align: right;">1 USD = {report_data.get('ghs_rate', 12.0)} GHS</td>
                    </tr>
                </table>
                
            </div>
            <div style="padding: 15px; background: #f3f4f6; border-radius: 0 0 8px 8px; text-align: center; color: #6b7280; font-size: 12px;">
                This is an automated report from GTI Fleet Solutions.<br>
                Log in to the dashboard for detailed information.
            </div>
        </body>
        </html>
        """
        return self.send_email(email, subject, html_content)

    def send_weekly_summary_report(self, email: str, report_data: dict) -> bool:
        """Send weekly summary report to Group Fleet Manager"""
        subject = f"📈 GTI Fleet Weekly Summary - Week of {report_data.get('week_start', 'N/A')}"
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Weekly Summary</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Week of {report_data.get('week_start', 'N/A')} | All Countries</p>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
                
                <!-- Key Metrics -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">📊 This Week's Highlights</h3>
                <table style="width: 100%; margin-bottom: 20px;">
                    <tr>
                        <td style="padding: 15px; background: #dbeafe; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #1d4ed8;">{report_data.get('trips_completed', 0)}</div>
                            <div style="color: #1e40af; font-size: 12px;">Trips Completed</div>
                        </td>
                        <td style="width: 10px;"></td>
                        <td style="padding: 15px; background: #dcfce7; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #15803d;">{report_data.get('distance_km', 0):,.0f}</div>
                            <div style="color: #166534; font-size: 12px;">Total KM Driven</div>
                        </td>
                        <td style="width: 10px;"></td>
                        <td style="padding: 15px; background: #fef3c7; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #b45309;">{report_data.get('maintenance_completed', 0)}</div>
                            <div style="color: #92400e; font-size: 12px;">Maintenance Done</div>
                        </td>
                    </tr>
                </table>
                
                <!-- Cost Analysis -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">💰 Weekly Costs</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px;">Fuel Expenditure</td>
                        <td style="padding: 12px; text-align: right; font-weight: bold;">GH₵ {report_data.get('fuel_cost_ghs', 0):,.2f}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px;">Maintenance Expenditure</td>
                        <td style="padding: 12px; text-align: right; font-weight: bold;">GH₵ {report_data.get('maintenance_cost_ghs', 0):,.2f}</td>
                    </tr>
                    <tr style="background: #f3f4f6;">
                        <td style="padding: 12px; font-weight: bold;">Total Weekly Cost</td>
                        <td style="padding: 12px; text-align: right; font-weight: bold; color: #6366f1;">GH₵ {report_data.get('total_cost_ghs', 0):,.2f}</td>
                    </tr>
                </table>
                
                <!-- Fleet Utilization -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🚛 Fleet Utilization</h3>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span>Average Utilization Rate:</span>
                        <strong>{report_data.get('avg_utilization', 0)}%</strong>
                    </div>
                    <div style="background: #e5e7eb; border-radius: 4px; height: 20px; overflow: hidden;">
                        <div style="background: linear-gradient(90deg, #22c55e, #16a34a); height: 100%; width: {report_data.get('avg_utilization', 0)}%;"></div>
                    </div>
                </div>
                
                <!-- Driver Performance -->
                <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">👤 Driver Performance</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px;">Speed Violations</td>
                        <td style="padding: 12px; text-align: right; color: {('#dc2626' if report_data.get('speed_violations', 0) > 0 else '#22c55e')}; font-weight: bold;">{report_data.get('speed_violations', 0)}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                        <td style="padding: 12px;">Pre-Trip Checklists Completed</td>
                        <td style="padding: 12px; text-align: right; font-weight: bold;">{report_data.get('checklists_completed', 0)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px;">Average Safety Score</td>
                        <td style="padding: 12px; text-align: right; font-weight: bold;">{report_data.get('avg_safety_score', 0)}/100</td>
                    </tr>
                </table>
                
            </div>
            <div style="padding: 15px; background: #f3f4f6; border-radius: 0 0 8px 8px; text-align: center; color: #6b7280; font-size: 12px;">
                This is an automated weekly report from GTI Fleet Solutions.<br>
                Generated on {report_data.get('generated_date', 'N/A')}
            </div>
        </body>
        </html>
        """
        return self.send_email(email, subject, html_content)

    def send_password_reset_email(self, email: str, reset_link: str, user_name: str) -> bool:
        """Send password reset email"""
        subject = "🔐 GTI Fleet Solutions - Password Reset Request"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">GTI Fleet Solutions - Password Reset</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Hello <strong>{user_name}</strong>,</p>
                <p>We received a request to reset your password for your GTI Fleet Solutions account.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        Reset Password
                    </a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
                <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">{reset_link}</p>
                
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                    <strong>⚠️ Important:</strong>
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


# Singleton instance
email_service = EmailService()
