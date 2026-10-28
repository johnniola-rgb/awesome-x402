from .csv_import import CsvSource
from .html_config import HtmlConfigSource
from .sample import SampleSource

SOURCE_TYPES = {"html": HtmlConfigSource, "csv": CsvSource, "sample": SampleSource}
