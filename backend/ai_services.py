from dotenv import load_dotenv
import os
import base64
import json
from typing import Dict, Any

load_dotenv()

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    _HAS_EMERGENT = True
except ImportError:  # Local / OSS installs without proprietary wheel
    LlmChat = None  # type: ignore[misc, assignment]
    UserMessage = None  # type: ignore[misc, assignment]
    ImageContent = None  # type: ignore[misc, assignment]
    _HAS_EMERGENT = False

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


def _ai_unavailable(reason: str) -> Dict[str, Any]:
    return {"error": reason}


class AIService:
    def __init__(self):
        self.api_key = EMERGENT_LLM_KEY

    def _llm_ready(self) -> bool:
        return bool(_HAS_EMERGENT and self.api_key and LlmChat and UserMessage)

    async def predict_maintenance(self, vehicle_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predict maintenance needs based on harshness of use
        """
        if not self._llm_ready():
            return _ai_unavailable(
                "AI maintenance prediction requires emergentintegrations and EMERGENT_LLM_KEY."
            )

        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"maintenance-{vehicle_data.get('vehicle_id')}",
            system_message="You are an AI mechanic analyzing vehicle data to predict maintenance needs.",
        ).with_model("openai", "gpt-5.2")

        prompt = f"""
        Analyze the following vehicle data and predict upcoming maintenance needs:

        Vehicle: {vehicle_data.get('make')} {vehicle_data.get('model')}
        Odometer: {vehicle_data.get('odometer_reading')} km
        Last Maintenance: {vehicle_data.get('last_maintenance_date')}
        Harshness Score: {vehicle_data.get('harshness_score', 5)}/10
        Usage Type: {vehicle_data.get('usage_type', 'Mixed')}

        Provide a JSON response with:
        1. predicted_issues: List of likely issues in next 3 months
        2. priority: HIGH/MEDIUM/LOW
        3. estimated_cost_usd: Estimated cost range
        4. recommended_date: Suggested maintenance date
        5. confidence: Confidence score 0-1

        Return only valid JSON, no markdown.
        """

        try:
            response = await chat.send_message(UserMessage(text=prompt))
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start != -1 and json_end > json_start:
                prediction = json.loads(response[json_start:json_end])
                return prediction
            return {"error": "Could not parse AI response"}
        except Exception as e:
            return {"error": str(e)}

    async def analyze_fuel_anomaly(self, fuel_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Detect fuel theft or anomalies
        """
        if not self._llm_ready():
            return _ai_unavailable(
                "AI fuel analysis requires emergentintegrations and EMERGENT_LLM_KEY."
            )

        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"fuel-anomaly-{fuel_data.get('vehicle_id')}",
            system_message="You are a fuel efficiency analyst detecting anomalies and potential fraud.",
        ).with_model("openai", "gpt-5.2")

        prompt = f"""
        Analyze this fuel transaction for anomalies:

        Quantity: {fuel_data.get('quantity_liters')} liters
        Cost: {fuel_data.get('cost')} {fuel_data.get('currency')}
        Odometer Change: {fuel_data.get('odometer_change')} km
        Vehicle Avg Efficiency: {fuel_data.get('avg_efficiency')} km/L
        Location: {fuel_data.get('location')}

        Return JSON with:
        1. anomaly_detected: true/false
        2. anomaly_type: THEFT/OVERCHARGE/INEFFICIENCY/NORMAL
        3. confidence: 0-1
        4. explanation: Brief explanation

        Return only valid JSON, no markdown.
        """

        try:
            response = await chat.send_message(UserMessage(text=prompt))
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start != -1 and json_end > json_start:
                analysis = json.loads(response[json_start:json_end])
                return analysis
            return {"anomaly_detected": False, "explanation": "Analysis failed"}
        except Exception as e:
            return {"anomaly_detected": False, "error": str(e)}

    async def ocr_document(self, image_base64: str, document_type: str, country: str) -> Dict[str, Any]:
        """
        Extract text from document using OpenAI Vision
        """
        if not self._llm_ready() or not ImageContent:
            return _ai_unavailable(
                "AI OCR requires emergentintegrations and EMERGENT_LLM_KEY."
            )

        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"ocr-{document_type}-{country}",
            system_message="You are an OCR expert extracting structured data from documents.",
        ).with_model("openai", "gpt-5.2")

        prompt = f"""
        Extract all relevant information from this {document_type} document from {country}.

        Return JSON with:
        1. document_number: Document ID/number
        2. issue_date: Issue date (YYYY-MM-DD)
        3. expiry_date: Expiry date (YYYY-MM-DD)
        4. holder_name: Name on document
        5. issuing_authority: Issuing organization
        6. additional_fields: Any other relevant data
        7. validation_status: VALID/EXPIRED/INVALID

        Return only valid JSON, no markdown.
        """

        try:
            image_content = ImageContent(image_base64=image_base64)
            response = await chat.send_message(
                UserMessage(
                    text=prompt,
                    file_contents=[image_content],
                )
            )

            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start != -1 and json_end > json_start:
                ocr_result = json.loads(response[json_start:json_end])
                return ocr_result
            return {"error": "Could not parse OCR response"}
        except Exception as e:
            return {"error": str(e)}

    async def predict_resale_value(self, asset_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predict vehicle resale value using AI
        """
        if not self._llm_ready():
            return _ai_unavailable(
                "AI resale prediction requires emergentintegrations and EMERGENT_LLM_KEY."
            )

        chat = LlmChat(
            api_key=self.api_key,
            session_id=f"resale-{asset_data.get('vehicle_id')}",
            system_message="You are a vehicle valuation expert predicting resale values.",
        ).with_model("openai", "gpt-5.2")

        prompt = f"""
        Predict the resale value for this vehicle:

        Vehicle: {asset_data.get('make')} {asset_data.get('model')} ({asset_data.get('year')})
        Current Age: {asset_data.get('age_years')} years
        Odometer: {asset_data.get('odometer')} km
        Condition: {asset_data.get('condition', 'Good')}
        Maintenance History: {asset_data.get('maintenance_score', 'Average')}
        Market: {asset_data.get('country')}
        Original Cost: ${asset_data.get('original_cost_usd')}

        Return JSON with:
        1. predicted_value_usd: Predicted resale value in USD
        2. depreciation_percent: Total depreciation %
        3. market_demand: HIGH/MEDIUM/LOW
        4. best_time_to_sell: Suggested timeframe
        5. confidence: 0-1

        Return only valid JSON, no markdown.
        """

        try:
            response = await chat.send_message(UserMessage(text=prompt))
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start != -1 and json_end > json_start:
                prediction = json.loads(response[json_start:json_end])
                return prediction
            return {"error": "Could not parse AI response"}
        except Exception as e:
            return {"error": str(e)}


ai_service = AIService()
