from dotenv import load_dotenv
import asyncio
import os
import json
from typing import Dict, Any, Optional

load_dotenv()

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    _HAS_EMERGENT = True
except ImportError:  # Local / OSS installs without proprietary wheel
    LlmChat = None  # type: ignore[misc, assignment]
    UserMessage = None  # type: ignore[misc, assignment]
    ImageContent = None  # type: ignore[misc, assignment]
    _HAS_EMERGENT = False

try:
    from google import genai as google_genai

    _HAS_GENAI = True
except ImportError:
    google_genai = None  # type: ignore[misc, assignment]
    _HAS_GENAI = False

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


def _ai_unavailable(reason: str) -> Dict[str, Any]:
    return {"error": reason}


def formula_resale_value(asset_data: Dict[str, Any]) -> float:
    """Declining-balance estimate: cost * (1 - rate)^age_years."""
    cost = asset_data.get("original_cost_usd")
    if cost is None:
        cost = asset_data.get("acquisition_cost_usd")
    try:
        cost = float(cost)
    except (TypeError, ValueError) as exc:
        raise ValueError("acquisition_cost_usd is required for formula resale prediction") from exc

    try:
        rate = float(asset_data.get("depreciation_rate") if asset_data.get("depreciation_rate") is not None else 0.15)
    except (TypeError, ValueError):
        rate = 0.15
    rate = max(0.0, min(rate, 0.99))

    try:
        age = float(asset_data.get("age_years") or 0)
    except (TypeError, ValueError):
        age = 0.0
    age = max(0.0, age)

    predicted = cost * ((1.0 - rate) ** age)
    return round(max(0.0, predicted), 2)


def _extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    json_start = text.find("{")
    json_end = text.rfind("}") + 1
    if json_start == -1 or json_end <= json_start:
        return None
    try:
        return json.loads(text[json_start:json_end])
    except json.JSONDecodeError:
        return None


def _gemini_generate_sync(prompt: str, system_message: str) -> str:
    if not (_HAS_GENAI and GEMINI_API_KEY and google_genai):
        raise RuntimeError("Gemini is not configured (GEMINI_API_KEY / google-genai)")
    client = google_genai.Client(api_key=GEMINI_API_KEY)
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config={"system_instruction": system_message},
    )
    return getattr(response, "text", None) or ""


class AIService:
    def __init__(self):
        self.api_key = EMERGENT_LLM_KEY
        self.gemini_api_key = GEMINI_API_KEY

    def _llm_ready(self) -> bool:
        return bool(_HAS_EMERGENT and self.api_key and LlmChat and UserMessage)

    def _gemini_ready(self) -> bool:
        return bool(_HAS_GENAI and self.gemini_api_key and google_genai)

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

    async def _predict_resale_with_gemini(self, asset_data: Dict[str, Any]) -> Dict[str, Any]:
        system_message = "You are a vehicle valuation expert predicting resale values. Return only valid JSON."
        prompt = f"""
        Predict the resale value for this vehicle:

        Vehicle: {asset_data.get('make')} {asset_data.get('model')} ({asset_data.get('year')})
        Current Age: {asset_data.get('age_years')} years
        Odometer: {asset_data.get('odometer')} km
        Condition: {asset_data.get('condition', 'Good')}
        Maintenance History: {asset_data.get('maintenance_score', 'Average')}
        Market: {asset_data.get('country')}
        Original Cost: ${asset_data.get('original_cost_usd')}
        Annual Depreciation Rate: {asset_data.get('depreciation_rate', 0.15)}

        Return JSON with:
        1. predicted_value_usd: Predicted resale value in USD (number)
        2. depreciation_percent: Total depreciation %
        3. market_demand: HIGH/MEDIUM/LOW
        4. best_time_to_sell: Suggested timeframe
        5. confidence: 0-1

        Return only valid JSON, no markdown.
        """
        text = await asyncio.to_thread(_gemini_generate_sync, prompt, system_message)
        parsed = _extract_json_object(text)
        if not parsed:
            raise ValueError("Could not parse Gemini resale response")
        value = parsed.get("predicted_value_usd")
        if value is None:
            raise ValueError("Gemini response missing predicted_value_usd")
        parsed["predicted_value_usd"] = float(value)
        parsed["method"] = "gemini"
        return parsed

    async def predict_resale_value(self, asset_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predict vehicle resale value using Gemini, with formula fallback.
        Always returns a numeric predicted_value_usd on the success path.
        """
        if self._gemini_ready():
            try:
                return await self._predict_resale_with_gemini(asset_data)
            except Exception as gemini_exc:
                try:
                    predicted = formula_resale_value(asset_data)
                    return {
                        "predicted_value_usd": predicted,
                        "depreciation_percent": round(
                            (1 - (predicted / float(asset_data.get("original_cost_usd") or asset_data.get("acquisition_cost_usd") or 1))) * 100,
                            1,
                        ),
                        "market_demand": "MEDIUM",
                        "best_time_to_sell": "Within 6–12 months",
                        "confidence": 0.55,
                        "method": "formula_fallback",
                        "ai_error": str(gemini_exc),
                    }
                except Exception as formula_exc:
                    return {"error": f"Gemini failed ({gemini_exc}); formula failed ({formula_exc})"}

        try:
            predicted = formula_resale_value(asset_data)
            return {
                "predicted_value_usd": predicted,
                "depreciation_percent": round(
                    (1 - (predicted / float(asset_data.get("original_cost_usd") or asset_data.get("acquisition_cost_usd") or 1))) * 100,
                    1,
                ),
                "market_demand": "MEDIUM",
                "best_time_to_sell": "Within 6–12 months",
                "confidence": 0.6,
                "method": "formula",
            }
        except Exception as e:
            return {"error": str(e)}


ai_service = AIService()
