#
# Beispiel-Parameterdatei zum Testen des Syntax-Highlightings.
#
name        hello.app
longname    "Hello World"
tokenchars  "HELL"
tokenid     999

type        appl process
class       HelloProcessClass
appobj      HelloApp

library     geos
library     ui

resource    AppResource ui-object
resource    InitCode code shared read-only preload no-swap

export      MyExportedRoutine as MyPublicName
stack       3000
