/* eslint-disable */
// generated - do not edit by hand.
//
// Generator: scripts/generate-dictionary.ts
// Innolitics dicom-standard SHA (pinned, full): 90571bcc4e46b08bc815bd683e6c466308bcff9a
// Normative source: NEMA DICOM PS3.6 2026d DocBook (Tables 6-1, 7-1, 8-1, 9-1).
//   vendor/nema/part06/<sha>/part06.xml → fa9f0f8d67eba692dcf95cfeae0a8f4e071beeb7844215a860bc4b9d5dfaad25
//   PS3.6 wins per field over the Innolitics mirror on every tag it publishes.
// Inputs (path → SHA-256):
//   - vendor/innolitics/<sha>/attributes.json → acc170c9646bf497e7c90dca904472f7eb673c9038c6198a92f82c66a9c74e5c
//
// Re-generate via `pnpm gen:dictionary`. CI gates byte-identical output.
// See vendor/innolitics/README.md and vendor/nema/README.md for re-pinning.
/**
 * The element registry, one row per tag in ascending order of its key: the tag (a repeating-group
 * row keeps its lowercase `x` placeholders), keyword, name, the VRs joined by `/`, VM, `R` when
 * retired, and `x` for a repeating-group row; fields joined by `|`. One string rather than an
 * object literal, so loading the package does not build 5310 objects:
 * `src/dictionary/registry.ts` reads a row the first time its tag is asked for.
 */
export const TAG_ROWS: string = `
00020000|FileMetaInformationGroupLength|File Meta Information Group Length|UL|1||
00020001|FileMetaInformationVersion|File Meta Information Version|OB|1||
00020002|MediaStorageSOPClassUID|Media Storage SOP Class UID|UI|1||
00020003|MediaStorageSOPInstanceUID|Media Storage SOP Instance UID|UI|1||
00020010|TransferSyntaxUID|Transfer Syntax UID|UI|1||
00020012|ImplementationClassUID|Implementation Class UID|UI|1||
00020013|ImplementationVersionName|Implementation Version Name|SH|1||
00020016|SourceApplicationEntityTitle|Source Application Entity Title|AE|1||
00020017|SendingApplicationEntityTitle|Sending Application Entity Title|AE|1||
00020018|ReceivingApplicationEntityTitle|Receiving Application Entity Title|AE|1||
00020026|SourcePresentationAddress|Source Presentation Address|UR|1||
00020027|SendingPresentationAddress|Sending Presentation Address|UR|1||
00020028|ReceivingPresentationAddress|Receiving Presentation Address|UR|1||
00020031|RTVMetaInformationVersion|RTV Meta Information Version|OB|1||
00020032|RTVCommunicationSOPClassUID|RTV Communication SOP Class UID|UI|1||
00020033|RTVCommunicationSOPInstanceUID|RTV Communication SOP Instance UID|UI|1||
00020035|RTVSourceIdentifier|RTV Source Identifier|OB|1||
00020036|RTVFlowIdentifier|RTV Flow Identifier|OB|1||
00020037|RTVFlowRTPSamplingRate|RTV Flow RTP Sampling Rate|UL|1||
00020038|RTVFlowActualFrameDuration|RTV Flow Actual Frame Duration|FD|1||
00020100|PrivateInformationCreatorUID|Private Information Creator UID|UI|1||
00020102|PrivateInformation|Private Information|OB|1||
00041130|FileSetID|File-set ID|CS|1||
00041141|FileSetDescriptorFileID|File-set Descriptor File ID|CS|1-8||
00041142|SpecificCharacterSetOfFileSetDescriptorFile|Specific Character Set of File-set Descriptor File|CS|1||
00041200|OffsetOfTheFirstDirectoryRecordOfTheRootDirectoryEntity|Offset of the First Directory Record of the Root Directory Entity|UL|1||
00041202|OffsetOfTheLastDirectoryRecordOfTheRootDirectoryEntity|Offset of the Last Directory Record of the Root Directory Entity|UL|1||
00041212|FileSetConsistencyFlag|File-set Consistency Flag|US|1||
00041220|DirectoryRecordSequence|Directory Record Sequence|SQ|1||
00041400|OffsetOfTheNextDirectoryRecord|Offset of the Next Directory Record|UL|1||
00041410|RecordInUseFlag|Record In-use Flag|US|1||
00041420|OffsetOfReferencedLowerLevelDirectoryEntity|Offset of Referenced Lower-Level Directory Entity|UL|1||
00041430|DirectoryRecordType|Directory Record Type|CS|1||
00041432|PrivateRecordUID|Private Record UID|UI|1||
00041500|ReferencedFileID|Referenced File ID|CS|1-8||
00041504|MRDRDirectoryRecordOffset|MRDR Directory Record Offset|UL|1|R|
00041510|ReferencedSOPClassUIDInFile|Referenced SOP Class UID in File|UI|1||
00041511|ReferencedSOPInstanceUIDInFile|Referenced SOP Instance UID in File|UI|1||
00041512|ReferencedTransferSyntaxUIDInFile|Referenced Transfer Syntax UID in File|UI|1||
0004151A|ReferencedRelatedGeneralSOPClassUIDInFile|Referenced Related General SOP Class UID in File|UI|1-n||
00041600|NumberOfReferences|Number of References|UL|1|R|
00060001|CurrentFrameFunctionalGroupsSequence|Current Frame Functional Groups Sequence|SQ|1||
00080001|LengthToEnd|Length to End|UL|1|R|
00080005|SpecificCharacterSet|Specific Character Set|CS|1-n||
00080006|LanguageCodeSequence|Language Code Sequence|SQ|1||
00080008|ImageType|Image Type|CS|2-n||
00080010|RecognitionCode|Recognition Code|SH|1|R|
00080012|InstanceCreationDate|Instance Creation Date|DA|1||
00080013|InstanceCreationTime|Instance Creation Time|TM|1||
00080014|InstanceCreatorUID|Instance Creator UID|UI|1||
00080015|InstanceCoercionDateTime|Instance Coercion DateTime|DT|1||
00080016|SOPClassUID|SOP Class UID|UI|1||
00080017|AcquisitionUID|Acquisition UID|UI|1||
00080018|SOPInstanceUID|SOP Instance UID|UI|1||
00080019|PyramidUID|Pyramid UID|UI|1||
0008001A|RelatedGeneralSOPClassUID|Related General SOP Class UID|UI|1-n||
0008001B|OriginalSpecializedSOPClassUID|Original Specialized SOP Class UID|UI|1||
0008001C|SyntheticData|Synthetic Data|CS|1||
0008001D|SensitiveContentCodeSequence|Sensitive Content Code Sequence|SQ|1||
00080020|StudyDate|Study Date|DA|1||
00080021|SeriesDate|Series Date|DA|1||
00080022|AcquisitionDate|Acquisition Date|DA|1||
00080023|ContentDate|Content Date|DA|1||
00080024|OverlayDate|Overlay Date|DA|1|R|
00080025|CurveDate|Curve Date|DA|1|R|
0008002A|AcquisitionDateTime|Acquisition DateTime|DT|1||
00080030|StudyTime|Study Time|TM|1||
00080031|SeriesTime|Series Time|TM|1||
00080032|AcquisitionTime|Acquisition Time|TM|1||
00080033|ContentTime|Content Time|TM|1||
00080034|OverlayTime|Overlay Time|TM|1|R|
00080035|CurveTime|Curve Time|TM|1|R|
00080040|DataSetType|Data Set Type|US|1|R|
00080041|DataSetSubtype|Data Set Subtype|LO|1|R|
00080042|NuclearMedicineSeriesType|Nuclear Medicine Series Type|CS|1|R|
00080050|AccessionNumber|Accession Number|SH|1||
00080051|IssuerOfAccessionNumberSequence|Issuer of Accession Number Sequence|SQ|1||
00080052|QueryRetrieveLevel|Query/Retrieve Level|CS|1||
00080053|QueryRetrieveView|Query/Retrieve View|CS|1||
00080054|RetrieveAETitle|Retrieve AE Title|AE|1-n||
00080055|StationAETitle|Station AE Title|AE|1||
00080056|InstanceAvailability|Instance Availability|CS|1||
00080058|FailedSOPInstanceUIDList|Failed SOP Instance UID List|UI|1-n||
00080060|Modality|Modality|CS|1||
00080061|ModalitiesInStudy|Modalities in Study|CS|1-n||
00080062|SOPClassesInStudy|SOP Classes in Study|UI|1-n||
00080063|AnatomicRegionsInStudyCodeSequence|Anatomic Regions in Study Code Sequence|SQ|1||
00080064|ConversionType|Conversion Type|CS|1||
00080068|PresentationIntentType|Presentation Intent Type|CS|1||
00080070|Manufacturer|Manufacturer|LO|1||
00080080|InstitutionName|Institution Name|LO|1||
00080081|InstitutionAddress|Institution Address|ST|1||
00080082|InstitutionCodeSequence|Institution Code Sequence|SQ|1||
00080090|ReferringPhysicianName|Referring Physician's Name|PN|1||
00080092|ReferringPhysicianAddress|Referring Physician's Address|ST|1||
00080094|ReferringPhysicianTelephoneNumbers|Referring Physician's Telephone Numbers|SH|1-n||
00080096|ReferringPhysicianIdentificationSequence|Referring Physician Identification Sequence|SQ|1||
0008009C|ConsultingPhysicianName|Consulting Physician's Name|PN|1-n||
0008009D|ConsultingPhysicianIdentificationSequence|Consulting Physician Identification Sequence|SQ|1||
00080100|CodeValue|Code Value|SH|1||
00080101|ExtendedCodeValue|Extended Code Value|LO|1||
00080102|CodingSchemeDesignator|Coding Scheme Designator|SH|1||
00080103|CodingSchemeVersion|Coding Scheme Version|SH|1||
00080104|CodeMeaning|Code Meaning|LO|1||
00080105|MappingResource|Mapping Resource|CS|1||
00080106|ContextGroupVersion|Context Group Version|DT|1||
00080107|ContextGroupLocalVersion|Context Group Local Version|DT|1||
00080108|ExtendedCodeMeaning|Extended Code Meaning|LT|1||
00080109|CodingSchemeResourcesSequence|Coding Scheme Resources Sequence|SQ|1||
0008010A|CodingSchemeURLType|Coding Scheme URL Type|CS|1||
0008010B|ContextGroupExtensionFlag|Context Group Extension Flag|CS|1||
0008010C|CodingSchemeUID|Coding Scheme UID|UI|1||
0008010D|ContextGroupExtensionCreatorUID|Context Group Extension Creator UID|UI|1||
0008010E|CodingSchemeURL|Coding Scheme URL|UR|1||
0008010F|ContextIdentifier|Context Identifier|CS|1||
00080110|CodingSchemeIdentificationSequence|Coding Scheme Identification Sequence|SQ|1||
00080112|CodingSchemeRegistry|Coding Scheme Registry|LO|1||
00080114|CodingSchemeExternalID|Coding Scheme External ID|ST|1||
00080115|CodingSchemeName|Coding Scheme Name|ST|1||
00080116|CodingSchemeResponsibleOrganization|Coding Scheme Responsible Organization|ST|1||
00080117|ContextUID|Context UID|UI|1||
00080118|MappingResourceUID|Mapping Resource UID|UI|1||
00080119|LongCodeValue|Long Code Value|UC|1||
00080120|URNCodeValue|URN Code Value|UR|1||
00080121|EquivalentCodeSequence|Equivalent Code Sequence|SQ|1||
00080122|MappingResourceName|Mapping Resource Name|LO|1||
00080123|ContextGroupIdentificationSequence|Context Group Identification Sequence|SQ|1||
00080124|MappingResourceIdentificationSequence|Mapping Resource Identification Sequence|SQ|1||
00080201|TimezoneOffsetFromUTC|Timezone Offset From UTC|SH|1||
00080202|||||R|
00080220|ResponsibleGroupCodeSequence|Responsible Group Code Sequence|SQ|1||
00080221|EquipmentModality|Equipment Modality|CS|1||
00080222|ManufacturerRelatedModelGroup|Manufacturer's Related Model Group|LO|1||
00080300|PrivateDataElementCharacteristicsSequence|Private Data Element Characteristics Sequence|SQ|1||
00080301|PrivateGroupReference|Private Group Reference|US|1||
00080302|PrivateCreatorReference|Private Creator Reference|LO|1||
00080303|BlockIdentifyingInformationStatus|Block Identifying Information Status|CS|1||
00080304|NonidentifyingPrivateElements|Nonidentifying Private Elements|US|1-n||
00080305|DeidentificationActionSequence|Deidentification Action Sequence|SQ|1||
00080306|IdentifyingPrivateElements|Identifying Private Elements|US|1-n||
00080307|DeidentificationAction|Deidentification Action|CS|1||
00080308|PrivateDataElement|Private Data Element|US|1||
00080309|PrivateDataElementValueMultiplicity|Private Data Element Value Multiplicity|UL|1-3||
0008030A|PrivateDataElementValueRepresentation|Private Data Element Value Representation|CS|1||
0008030B|PrivateDataElementNumberOfItems|Private Data Element Number of Items|UL|1-2||
0008030C|PrivateDataElementName|Private Data Element Name|UC|1||
0008030D|PrivateDataElementKeyword|Private Data Element Keyword|UC|1||
0008030E|PrivateDataElementDescription|Private Data Element Description|UT|1||
0008030F|PrivateDataElementEncoding|Private Data Element Encoding|UT|1||
00080310|PrivateDataElementDefinitionSequence|Private Data Element Definition Sequence|SQ|1||
00080400|ScopeOfInventorySequence|Scope of Inventory Sequence|SQ|1||
00080401|InventoryPurpose|Inventory Purpose|LT|1||
00080402|InventoryInstanceDescription|Inventory Instance Description|LT|1||
00080403|InventoryLevel|Inventory Level|CS|1||
00080404|ItemInventoryDateTime|Item Inventory DateTime|DT|1||
00080405|RemovedFromOperationalUse|Removed from Operational Use|CS|1||
00080406|ReasonForRemovalCodeSequence|Reason for Removal Code Sequence|SQ|1||
00080407|StoredInstanceBaseURI|Stored Instance Base URI|UR|1||
00080408|FolderAccessURI|Folder Access URI|UR|1||
00080409|FileAccessURI|File Access URI|UR|1||
0008040A|ContainerFileType|Container File Type|CS|1||
0008040B|FilenameInContainer|Filename in Container|UR|1||
0008040C|FileOffsetInContainer|File Offset in Container|UV|1||
0008040D|FileLengthInContainer|File Length in Container|UV|1||
0008040E|StoredInstanceTransferSyntaxUID|Stored Instance Transfer Syntax UID|UI|1||
0008040F|ExtendedMatchingMechanisms|Extended Matching Mechanisms|CS|1-n||
00080410|RangeMatchingSequence|Range Matching Sequence|SQ|1||
00080411|ListOfUIDMatchingSequence|List of UID Matching Sequence|SQ|1||
00080412|EmptyValueMatchingSequence|Empty Value Matching Sequence|SQ|1||
00080413|GeneralMatchingSequence|General Matching Sequence|SQ|1||
00080414|RequestedStatusInterval|Requested Status Interval|US|1||
00080415|RetainInstances|Retain Instances|CS|1||
00080416|ExpirationDateTime|Expiration DateTime|DT|1||
00080417|TransactionStatus|Transaction Status|CS|1||
00080418|TransactionStatusComment|Transaction Status Comment|LT|1||
00080419|FileSetAccessSequence|File Set Access Sequence|SQ|1||
0008041A|FileAccessSequence|File Access Sequence|SQ|1||
0008041B|RecordKey|Record Key|OB|1||
0008041C|PriorRecordKey|Prior Record Key|OB|1||
0008041D|MetadataSequence|Metadata Sequence|SQ|1||
0008041E|UpdatedMetadataSequence|Updated Metadata Sequence|SQ|1||
0008041F|StudyUpdateDateTime|Study Update DateTime|DT|1||
00080420|InventoryAccessEndPointsSequence|Inventory Access End Points Sequence|SQ|1||
00080421|StudyAccessEndPointsSequence|Study Access End Points Sequence|SQ|1||
00080422|IncorporatedInventoryInstanceSequence|Incorporated Inventory Instance Sequence|SQ|1||
00080423|InventoriedStudiesSequence|Inventoried Studies Sequence|SQ|1||
00080424|InventoriedSeriesSequence|Inventoried Series Sequence|SQ|1||
00080425|InventoriedInstancesSequence|Inventoried Instances Sequence|SQ|1||
00080426|InventoryCompletionStatus|Inventory Completion Status|CS|1||
00080427|NumberOfStudyRecordsInInstance|Number of Study Records in Instance|UL|1||
00080428|TotalNumberOfStudyRecords|Total Number of Study Records|UV|1||
00080429|MaximumNumberOfRecords|Maximum Number of Records|UV|1||
00081000|NetworkID|Network ID|AE|1|R|
00081010|StationName|Station Name|SH|1||
00081030|StudyDescription|Study Description|LO|1||
00081032|ProcedureCodeSequence|Procedure Code Sequence|SQ|1||
0008103E|SeriesDescription|Series Description|LO|1||
0008103F|SeriesDescriptionCodeSequence|Series Description Code Sequence|SQ|1||
00081040|InstitutionalDepartmentName|Institutional Department Name|LO|1||
00081041|InstitutionalDepartmentTypeCodeSequence|Institutional Department Type Code Sequence|SQ|1||
00081048|PhysiciansOfRecord|Physician(s) of Record|PN|1-n||
00081049|PhysiciansOfRecordIdentificationSequence|Physician(s) of Record Identification Sequence|SQ|1||
00081050|PerformingPhysicianName|Performing Physician's Name|PN|1-n||
00081052|PerformingPhysicianIdentificationSequence|Performing Physician Identification Sequence|SQ|1||
00081060|NameOfPhysiciansReadingStudy|Name of Physician(s) Reading Study|PN|1-n||
00081062|PhysiciansReadingStudyIdentificationSequence|Physician(s) Reading Study Identification Sequence|SQ|1||
00081070|OperatorsName|Operators' Name|PN|1-n||
00081072|OperatorIdentificationSequence|Operator Identification Sequence|SQ|1||
00081080|AdmittingDiagnosesDescription|Admitting Diagnoses Description|LO|1-n||
00081084|AdmittingDiagnosesCodeSequence|Admitting Diagnoses Code Sequence|SQ|1||
00081088|PyramidDescription|Pyramid Description|LO|1||
00081090|ManufacturerModelName|Manufacturer's Model Name|LO|1||
00081100|ReferencedResultsSequence|Referenced Results Sequence|SQ|1|R|
00081110|ReferencedStudySequence|Referenced Study Sequence|SQ|1||
00081111|ReferencedPerformedProcedureStepSequence|Referenced Performed Procedure Step Sequence|SQ|1||
00081112|ReferencedInstancesBySOPClassSequence|Referenced Instances by SOP Class Sequence|SQ|1||
00081115|ReferencedSeriesSequence|Referenced Series Sequence|SQ|1||
00081120|ReferencedPatientSequence|Referenced Patient Sequence|SQ|1||
00081125|ReferencedVisitSequence|Referenced Visit Sequence|SQ|1||
00081130|ReferencedOverlaySequence|Referenced Overlay Sequence|SQ|1|R|
00081134|ReferencedStereometricInstanceSequence|Referenced Stereometric Instance Sequence|SQ|1||
0008113A|ReferencedWaveformSequence|Referenced Waveform Sequence|SQ|1||
00081140|ReferencedImageSequence|Referenced Image Sequence|SQ|1||
00081145|ReferencedCurveSequence|Referenced Curve Sequence|SQ|1|R|
0008114A|ReferencedInstanceSequence|Referenced Instance Sequence|SQ|1||
0008114B|ReferencedRealWorldValueMappingInstanceSequence|Referenced Real World Value Mapping Instance Sequence|SQ|1||
0008114C|ReferencedSegmentationSequence|Referenced Segmentation Sequence|SQ|1||
0008114D|ReferencedSurfaceSegmentationSequence|Referenced Surface Segmentation Sequence|SQ|1||
00081150|ReferencedSOPClassUID|Referenced SOP Class UID|UI|1||
00081155|ReferencedSOPInstanceUID|Referenced SOP Instance UID|UI|1||
00081156|DefinitionSourceSequence|Definition Source Sequence|SQ|1||
0008115A|SOPClassesSupported|SOP Classes Supported|UI|1-n||
00081160|ReferencedFrameNumber|Referenced Frame Number|IS|1-n||
00081161|SimpleFrameList|Simple Frame List|UL|1-n||
00081162|CalculatedFrameList|Calculated Frame List|UL|3-3n||
00081163|TimeRange|Time Range|FD|2||
00081164|FrameExtractionSequence|Frame Extraction Sequence|SQ|1||
00081167|MultiFrameSourceSOPInstanceUID|Multi-frame Source SOP Instance UID|UI|1||
00081190|RetrieveURL|Retrieve URL|UR|1||
00081195|TransactionUID|Transaction UID|UI|1||
00081196|WarningReason|Warning Reason|US|1||
00081197|FailureReason|Failure Reason|US|1||
00081198|FailedSOPSequence|Failed SOP Sequence|SQ|1||
00081199|ReferencedSOPSequence|Referenced SOP Sequence|SQ|1||
0008119A|OtherFailuresSequence|Other Failures Sequence|SQ|1||
0008119B|FailedStudySequence|Failed Study Sequence|SQ|1||
00081200|StudiesContainingOtherReferencedInstancesSequence|Studies Containing Other Referenced Instances Sequence|SQ|1||
00081250|RelatedSeriesSequence|Related Series Sequence|SQ|1||
00081301|PrincipalDiagnosisCodeSequence|Principal Diagnosis Code Sequence|SQ|1||
00081302|PrimaryDiagnosisCodeSequence|Primary Diagnosis Code Sequence|SQ|1||
00081303|SecondaryDiagnosesCodeSequence|Secondary Diagnoses Code Sequence|SQ|1||
00081304|HistologicalDiagnosesCodeSequence|Histological Diagnoses Code Sequence|SQ|1||
00082110|LossyImageCompressionRetired|Lossy Image Compression (Retired)|CS|1|R|
00082111|DerivationDescription|Derivation Description|ST|1||
00082112|SourceImageSequence|Source Image Sequence|SQ|1||
00082120|StageName|Stage Name|SH|1||
00082122|StageNumber|Stage Number|IS|1||
00082124|NumberOfStages|Number of Stages|IS|1||
00082127|ViewName|View Name|SH|1||
00082128|ViewNumber|View Number|IS|1||
00082129|NumberOfEventTimers|Number of Event Timers|IS|1||
0008212A|NumberOfViewsInStage|Number of Views in Stage|IS|1||
00082130|EventElapsedTimes|Event Elapsed Time(s)|DS|1-n||
00082132|EventTimerNames|Event Timer Name(s)|LO|1-n||
00082133|EventTimerSequence|Event Timer Sequence|SQ|1||
00082134|EventTimeOffset|Event Time Offset|FD|1||
00082135|EventCodeSequence|Event Code Sequence|SQ|1||
00082142|StartTrim|Start Trim|IS|1||
00082143|StopTrim|Stop Trim|IS|1||
00082144|RecommendedDisplayFrameRate|Recommended Display Frame Rate|IS|1||
00082200|TransducerPosition|Transducer Position|CS|1|R|
00082204|TransducerOrientation|Transducer Orientation|CS|1|R|
00082208|AnatomicStructure|Anatomic Structure|CS|1|R|
00082218|AnatomicRegionSequence|Anatomic Region Sequence|SQ|1||
00082220|AnatomicRegionModifierSequence|Anatomic Region Modifier Sequence|SQ|1||
00082228|PrimaryAnatomicStructureSequence|Primary Anatomic Structure Sequence|SQ|1||
00082229|AnatomicStructureSpaceOrRegionSequence|Anatomic Structure, Space or Region Sequence|SQ|1|R|
00082230|PrimaryAnatomicStructureModifierSequence|Primary Anatomic Structure Modifier Sequence|SQ|1||
00082240|TransducerPositionSequence|Transducer Position Sequence|SQ|1|R|
00082242|TransducerPositionModifierSequence|Transducer Position Modifier Sequence|SQ|1|R|
00082244|TransducerOrientationSequence|Transducer Orientation Sequence|SQ|1|R|
00082246|TransducerOrientationModifierSequence|Transducer Orientation Modifier Sequence|SQ|1|R|
00082251|AnatomicStructureSpaceOrRegionCodeSequenceTrial|Anatomic Structure Space Or Region Code Sequence (Trial)|SQ|1|R|
00082253|AnatomicPortalOfEntranceCodeSequenceTrial|Anatomic Portal Of Entrance Code Sequence (Trial)|SQ|1|R|
00082255|AnatomicApproachDirectionCodeSequenceTrial|Anatomic Approach Direction Code Sequence (Trial)|SQ|1|R|
00082256|AnatomicPerspectiveDescriptionTrial|Anatomic Perspective Description (Trial)|ST|1|R|
00082257|AnatomicPerspectiveCodeSequenceTrial|Anatomic Perspective Code Sequence (Trial)|SQ|1|R|
00082258|AnatomicLocationOfExaminingInstrumentDescriptionTrial|Anatomic Location Of Examining Instrument Description (Trial)|ST|1|R|
00082259|AnatomicLocationOfExaminingInstrumentCodeSequenceTrial|Anatomic Location Of Examining Instrument Code Sequence (Trial)|SQ|1|R|
0008225A|AnatomicStructureSpaceOrRegionModifierCodeSequenceTrial|Anatomic Structure Space Or Region Modifier Code Sequence (Trial)|SQ|1|R|
0008225C|OnAxisBackgroundAnatomicStructureCodeSequenceTrial|On Axis Background Anatomic Structure Code Sequence (Trial)|SQ|1|R|
00083001|AlternateRepresentationSequence|Alternate Representation Sequence|SQ|1||
00083002|AvailableTransferSyntaxUID|Available Transfer Syntax UID|UI|1-n||
00083010|IrradiationEventUID|Irradiation Event UID|UI|1-n||
00083011|SourceIrradiationEventSequence|Source Irradiation Event Sequence|SQ|1||
00083012|RadiopharmaceuticalAdministrationEventUID|Radiopharmaceutical Administration Event UID|UI|1||
00084000|IdentifyingComments|Identifying Comments|LT|1|R|
00089007|FrameType|Frame Type|CS|4-5||
00089092|ReferencedImageEvidenceSequence|Referenced Image Evidence Sequence|SQ|1||
00089121|ReferencedRawDataSequence|Referenced Raw Data Sequence|SQ|1||
00089123|CreatorVersionUID|Creator-Version UID|UI|1||
00089124|DerivationImageSequence|Derivation Image Sequence|SQ|1||
00089154|SourceImageEvidenceSequence|Source Image Evidence Sequence|SQ|1||
00089205|PixelPresentation|Pixel Presentation|CS|1||
00089206|VolumetricProperties|Volumetric Properties|CS|1||
00089207|VolumeBasedCalculationTechnique|Volume Based Calculation Technique|CS|1||
00089208|ComplexImageComponent|Complex Image Component|CS|1||
00089209|AcquisitionContrast|Acquisition Contrast|CS|1||
00089215|DerivationCodeSequence|Derivation Code Sequence|SQ|1||
00089237|ReferencedPresentationStateSequence|Referenced Presentation State Sequence|SQ|1||
00089410|ReferencedOtherPlaneSequence|Referenced Other Plane Sequence|SQ|1||
00089458|FrameDisplaySequence|Frame Display Sequence|SQ|1||
00089459|RecommendedDisplayFrameRateInFloat|Recommended Display Frame Rate in Float|FL|1||
00089460|SkipFrameRangeFlag|Skip Frame Range Flag|CS|1||
00100010|PatientName|Patient's Name|PN|1||
00100011|PersonNamesToUseSequence|Person Names to Use Sequence|SQ|1||
00100012|NameToUse|Name to Use|LT|1||
00100013|NameToUseComment|Name to Use Comment|UT|1||
00100014|ThirdPersonPronounsSequence|Third Person Pronouns Sequence|SQ|1||
00100015|PronounCodeSequence|Pronoun Code Sequence|SQ|1||
00100016|PronounComment|Pronoun Comment|UT|1||
00100020|PatientID|Patient ID|LO|1||
00100021|IssuerOfPatientID|Issuer of Patient ID|LO|1||
00100022|TypeOfPatientID|Type of Patient ID|CS|1||
00100024|IssuerOfPatientIDQualifiersSequence|Issuer of Patient ID Qualifiers Sequence|SQ|1||
00100026|SourcePatientGroupIdentificationSequence|Source Patient Group Identification Sequence|SQ|1||
00100027|GroupOfPatientsIdentificationSequence|Group of Patients Identification Sequence|SQ|1||
00100028|SubjectRelativePositionInImage|Subject Relative Position in Image|US|3||
00100030|PatientBirthDate|Patient's Birth Date|DA|1||
00100032|PatientBirthTime|Patient's Birth Time|TM|1||
00100033|PatientBirthDateInAlternativeCalendar|Patient's Birth Date in Alternative Calendar|LO|1||
00100034|PatientDeathDateInAlternativeCalendar|Patient's Death Date in Alternative Calendar|LO|1||
00100035|PatientAlternativeCalendar|Patient's Alternative Calendar|CS|1||
00100040|PatientSex|Patient's Sex|CS|1||
00100041|GenderIdentitySequence|Gender Identity Sequence|SQ|1||
00100042|SexParametersForClinicalUseCategoryComment|Sex Parameters for Clinical Use Category Comment|UT|1||
00100043|SexParametersForClinicalUseCategorySequence|Sex Parameters for Clinical Use Category Sequence|SQ|1||
00100044|GenderIdentityCodeSequence|Gender Identity Code Sequence|SQ|1||
00100045|GenderIdentityComment|Gender Identity Comment|UT|1||
00100046|SexParametersForClinicalUseCategoryCodeSequence|Sex Parameters for Clinical Use Category Code Sequence|SQ|1||
00100047|SexParametersForClinicalUseCategoryReference|Sex Parameters for Clinical Use Category Reference|UR|1-n||
00100050|PatientInsurancePlanCodeSequence|Patient's Insurance Plan Code Sequence|SQ|1||
00100101|PatientPrimaryLanguageCodeSequence|Patient's Primary Language Code Sequence|SQ|1||
00100102|PatientPrimaryLanguageModifierCodeSequence|Patient's Primary Language Modifier Code Sequence|SQ|1||
00100200|QualityControlSubject|Quality Control Subject|CS|1||
00100201|QualityControlSubjectTypeCodeSequence|Quality Control Subject Type Code Sequence|SQ|1||
00100212|StrainDescription|Strain Description|UC|1||
00100213|StrainNomenclature|Strain Nomenclature|LO|1||
00100214|StrainStockNumber|Strain Stock Number|LO|1||
00100215|StrainSourceRegistryCodeSequence|Strain Source Registry Code Sequence|SQ|1||
00100216|StrainStockSequence|Strain Stock Sequence|SQ|1||
00100217|StrainSource|Strain Source|LO|1||
00100218|StrainAdditionalInformation|Strain Additional Information|UT|1||
00100219|StrainCodeSequence|Strain Code Sequence|SQ|1||
00100221|GeneticModificationsSequence|Genetic Modifications Sequence|SQ|1||
00100222|GeneticModificationsDescription|Genetic Modifications Description|UC|1||
00100223|GeneticModificationsNomenclature|Genetic Modifications Nomenclature|LO|1||
00100229|GeneticModificationsCodeSequence|Genetic Modifications Code Sequence|SQ|1||
00101000|OtherPatientIDs|Other Patient IDs|LO|1-n|R|
00101001|OtherPatientNames|Other Patient Names|PN|1-n||
00101002|OtherPatientIDsSequence|Other Patient IDs Sequence|SQ|1||
00101005|PatientBirthName|Patient's Birth Name|PN|1||
00101010|PatientAge|Patient's Age|AS|1||
00101020|PatientSize|Patient's Size|DS|1||
00101021|PatientSizeCodeSequence|Patient's Size Code Sequence|SQ|1||
00101022|PatientBodyMassIndex|Patient's Body Mass Index|DS|1||
00101023|MeasuredAPDimension|Measured AP Dimension|DS|1||
00101024|MeasuredLateralDimension|Measured Lateral Dimension|DS|1||
00101030|PatientWeight|Patient's Weight|DS|1||
00101040|PatientAddress|Patient's Address|LO|1||
00101050|InsurancePlanIdentification|Insurance Plan Identification|LO|1-n|R|
00101060|PatientMotherBirthName|Patient's Mother's Birth Name|PN|1||
00101080|MilitaryRank|Military Rank|LO|1||
00101081|BranchOfService|Branch of Service|LO|1||
00101090|MedicalRecordLocator|Medical Record Locator|LO|1|R|
00101100|ReferencedPatientPhotoSequence|Referenced Patient Photo Sequence|SQ|1||
00102000|MedicalAlerts|Medical Alerts|LO|1-n||
00102110|Allergies|Allergies|LO|1-n||
00102150|CountryOfResidence|Country of Residence|LO|1||
00102152|RegionOfResidence|Region of Residence|LO|1||
00102154|PatientTelephoneNumbers|Patient's Telephone Numbers|SH|1-n||
00102155|PatientTelecomInformation|Patient's Telecom Information|LT|1||
00102160|EthnicGroup|Ethnic Group|SH|1|R|
00102161|EthnicGroupCodeSequence|Ethnic Group Code Sequence|SQ|1||
00102162|EthnicGroups|Ethnic Groups|UC|1-n||
00102180|Occupation|Occupation|SH|1||
001021A0|SmokingStatus|Smoking Status|CS|1||
001021B0|AdditionalPatientHistory|Additional Patient History|LT|1||
001021C0|PregnancyStatus|Pregnancy Status|US|1||
001021D0|LastMenstrualDate|Last Menstrual Date|DA|1||
001021F0|PatientReligiousPreference|Patient's Religious Preference|LO|1||
00102201|PatientSpeciesDescription|Patient Species Description|LO|1||
00102202|PatientSpeciesCodeSequence|Patient Species Code Sequence|SQ|1||
00102203|PatientSexNeutered|Patient's Sex Neutered|CS|1||
00102210|AnatomicalOrientationType|Anatomical Orientation Type|CS|1||
00102292|PatientBreedDescription|Patient Breed Description|LO|1||
00102293|PatientBreedCodeSequence|Patient Breed Code Sequence|SQ|1||
00102294|BreedRegistrationSequence|Breed Registration Sequence|SQ|1||
00102295|BreedRegistrationNumber|Breed Registration Number|LO|1||
00102296|BreedRegistryCodeSequence|Breed Registry Code Sequence|SQ|1||
00102297|ResponsiblePerson|Responsible Person|PN|1||
00102298|ResponsiblePersonRole|Responsible Person Role|CS|1||
00102299|ResponsibleOrganization|Responsible Organization|LO|1||
00104000|PatientComments|Patient Comments|LT|1||
00109431|ExaminedBodyThickness|Examined Body Thickness|FL|1||
00120010|ClinicalTrialSponsorName|Clinical Trial Sponsor Name|LO|1||
00120020|ClinicalTrialProtocolID|Clinical Trial Protocol ID|LO|1||
00120021|ClinicalTrialProtocolName|Clinical Trial Protocol Name|LO|1||
00120022|IssuerOfClinicalTrialProtocolID|Issuer of Clinical Trial Protocol ID|LO|1||
00120023|OtherClinicalTrialProtocolIDsSequence|Other Clinical Trial Protocol IDs Sequence|SQ|1||
00120030|ClinicalTrialSiteID|Clinical Trial Site ID|LO|1||
00120031|ClinicalTrialSiteName|Clinical Trial Site Name|LO|1||
00120032|IssuerOfClinicalTrialSiteID|Issuer of Clinical Trial Site ID|LO|1||
00120040|ClinicalTrialSubjectID|Clinical Trial Subject ID|LO|1||
00120041|IssuerOfClinicalTrialSubjectID|Issuer of Clinical Trial Subject ID|LO|1||
00120042|ClinicalTrialSubjectReadingID|Clinical Trial Subject Reading ID|LO|1||
00120043|IssuerOfClinicalTrialSubjectReadingID|Issuer of Clinical Trial Subject Reading ID|LO|1||
00120050|ClinicalTrialTimePointID|Clinical Trial Time Point ID|LO|1||
00120051|ClinicalTrialTimePointDescription|Clinical Trial Time Point Description|ST|1||
00120052|LongitudinalTemporalOffsetFromEvent|Longitudinal Temporal Offset from Event|FD|1||
00120053|LongitudinalTemporalEventType|Longitudinal Temporal Event Type|CS|1||
00120054|ClinicalTrialTimePointTypeCodeSequence|Clinical Trial Time Point Type Code Sequence|SQ|1||
00120055|IssuerOfClinicalTrialTimePointID|Issuer of Clinical Trial Time Point ID|LO|1||
00120060|ClinicalTrialCoordinatingCenterName|Clinical Trial Coordinating Center Name|LO|1||
00120062|PatientIdentityRemoved|Patient Identity Removed|CS|1||
00120063|DeidentificationMethod|De-identification Method|LO|1-n||
00120064|DeidentificationMethodCodeSequence|De-identification Method Code Sequence|SQ|1||
00120071|ClinicalTrialSeriesID|Clinical Trial Series ID|LO|1||
00120072|ClinicalTrialSeriesDescription|Clinical Trial Series Description|LO|1||
00120073|IssuerOfClinicalTrialSeriesID|Issuer of Clinical Trial Series ID|LO|1||
00120081|ClinicalTrialProtocolEthicsCommitteeName|Clinical Trial Protocol Ethics Committee Name|LO|1||
00120082|ClinicalTrialProtocolEthicsCommitteeApprovalNumber|Clinical Trial Protocol Ethics Committee Approval Number|LO|1||
00120083|ConsentForClinicalTrialUseSequence|Consent for Clinical Trial Use Sequence|SQ|1||
00120084|DistributionType|Distribution Type|CS|1||
00120085|ConsentForDistributionFlag|Consent for Distribution Flag|CS|1||
00120086|EthicsCommitteeApprovalEffectivenessStartDate|Ethics Committee Approval Effectiveness Start Date|DA|1||
00120087|EthicsCommitteeApprovalEffectivenessEndDate|Ethics Committee Approval Effectiveness End Date|DA|1||
00140023|CADFileFormat|CAD File Format|ST|1|R|
00140024|ComponentReferenceSystem|Component Reference System|ST|1|R|
00140025|ComponentManufacturingProcedure|Component Manufacturing Procedure|ST|1||
00140028|ComponentManufacturer|Component Manufacturer|ST|1||
00140030|MaterialThickness|Material Thickness|DS|1-n||
00140032|MaterialPipeDiameter|Material Pipe Diameter|DS|1-n||
00140034|MaterialIsolationDiameter|Material Isolation Diameter|DS|1-n||
00140042|MaterialGrade|Material Grade|ST|1||
00140044|MaterialPropertiesDescription|Material Properties Description|ST|1||
00140045|MaterialPropertiesFileFormatRetired|Material Properties File Format (Retired)|ST|1|R|
00140046|MaterialNotes|Material Notes|LT|1||
00140050|ComponentShape|Component Shape|CS|1||
00140052|CurvatureType|Curvature Type|CS|1||
00140054|OuterDiameter|Outer Diameter|DS|1||
00140056|InnerDiameter|Inner Diameter|DS|1||
00140100|ComponentWelderIDs|Component Welder IDs|LO|1-n||
00140101|SecondaryApprovalStatus|Secondary Approval Status|CS|1||
00140102|SecondaryReviewDate|Secondary Review Date|DA|1||
00140103|SecondaryReviewTime|Secondary Review Time|TM|1||
00140104|SecondaryReviewerName|Secondary Reviewer Name|PN|1||
00140105|RepairID|Repair ID|ST|1||
00140106|MultipleComponentApprovalSequence|Multiple Component Approval Sequence|SQ|1||
00140107|OtherApprovalStatus|Other Approval Status|CS|1-n||
00140108|OtherSecondaryApprovalStatus|Other Secondary Approval Status|CS|1-n||
00140200|DataElementLabelSequence|Data Element Label Sequence|SQ|1||
00140201|DataElementLabelItemSequence|Data Element Label Item Sequence|SQ|1||
00140202|DataElement|Data Element|AT|1||
00140203|DataElementName|Data Element Name|LO|1||
00140204|DataElementDescription|Data Element Description|LO|1||
00140205|DataElementConditionality|Data Element Conditionality|CS|1||
00140206|DataElementMinimumCharacters|Data Element Minimum Characters|IS|1||
00140207|DataElementMaximumCharacters|Data Element Maximum Characters|IS|1||
00141010|ActualEnvironmentalConditions|Actual Environmental Conditions|ST|1||
00141020|ExpiryDate|Expiry Date|DA|1||
00141040|EnvironmentalConditions|Environmental Conditions|ST|1||
00142002|EvaluatorSequence|Evaluator Sequence|SQ|1||
00142004|EvaluatorNumber|Evaluator Number|IS|1||
00142006|EvaluatorName|Evaluator Name|PN|1||
00142008|EvaluationAttempt|Evaluation Attempt|IS|1||
00142012|IndicationSequence|Indication Sequence|SQ|1||
00142014|IndicationNumber|Indication Number|IS|1||
00142016|IndicationLabel|Indication Label|SH|1||
00142018|IndicationDescription|Indication Description|ST|1||
0014201A|IndicationType|Indication Type|CS|1-n||
0014201C|IndicationDisposition|Indication Disposition|CS|1||
0014201E|IndicationROISequence|Indication ROI Sequence|SQ|1||
00142030|IndicationPhysicalPropertySequence|Indication Physical Property Sequence|SQ|1||
00142032|PropertyLabel|Property Label|SH|1||
00142202|CoordinateSystemNumberOfAxes|Coordinate System Number of Axes|IS|1||
00142204|CoordinateSystemAxesSequence|Coordinate System Axes Sequence|SQ|1||
00142206|CoordinateSystemAxisDescription|Coordinate System Axis Description|ST|1||
00142208|CoordinateSystemDataSetMapping|Coordinate System Data Set Mapping|CS|1||
0014220A|CoordinateSystemAxisNumber|Coordinate System Axis Number|IS|1||
0014220C|CoordinateSystemAxisType|Coordinate System Axis Type|CS|1||
0014220E|CoordinateSystemAxisUnits|Coordinate System Axis Units|CS|1||
00142210|CoordinateSystemAxisValues|Coordinate System Axis Values|OB|1||
00142220|CoordinateSystemTransformSequence|Coordinate System Transform Sequence|SQ|1||
00142222|TransformDescription|Transform Description|ST|1||
00142224|TransformNumberOfAxes|Transform Number of Axes|IS|1||
00142226|TransformOrderOfAxes|Transform Order of Axes|IS|1-n||
00142228|TransformedAxisUnits|Transformed Axis Units|CS|1||
0014222A|CoordinateSystemTransformRotationAndScaleMatrix|Coordinate System Transform Rotation and Scale Matrix|DS|1-n||
0014222C|CoordinateSystemTransformTranslationMatrix|Coordinate System Transform Translation Matrix|DS|1-n||
00143011|InternalDetectorFrameTime|Internal Detector Frame Time|DS|1||
00143012|NumberOfFramesIntegrated|Number of Frames Integrated|DS|1||
00143020|DetectorTemperatureSequence|Detector Temperature Sequence|SQ|1||
00143022|SensorName|Sensor Name|ST|1||
00143024|HorizontalOffsetOfSensor|Horizontal Offset of Sensor|DS|1||
00143026|VerticalOffsetOfSensor|Vertical Offset of Sensor|DS|1||
00143028|SensorTemperature|Sensor Temperature|DS|1||
00143040|DarkCurrentSequence|Dark Current Sequence|SQ|1||
00143050|DarkCurrentCounts|Dark Current Counts|OB/OW|1||
00143060|GainCorrectionReferenceSequence|Gain Correction Reference Sequence|SQ|1||
00143070|AirCounts|Air Counts|OB/OW|1||
00143071|KVUsedInGainCalibration|KV Used in Gain Calibration|DS|1||
00143072|MAUsedInGainCalibration|MA Used in Gain Calibration|DS|1||
00143073|NumberOfFramesUsedForIntegration|Number of Frames Used for Integration|DS|1||
00143074|FilterMaterialUsedInGainCalibration|Filter Material Used in Gain Calibration|LO|1||
00143075|FilterThicknessUsedInGainCalibration|Filter Thickness Used in Gain Calibration|DS|1||
00143076|DateOfGainCalibration|Date of Gain Calibration|DA|1||
00143077|TimeOfGainCalibration|Time of Gain Calibration|TM|1||
00143080|BadPixelImage|Bad Pixel Image|OB|1||
00143099|CalibrationNotes|Calibration Notes|LT|1||
00143100|LinearityCorrectionTechnique|Linearity Correction Technique|LT|1||
00143101|BeamHardeningCorrectionTechnique|Beam Hardening Correction Technique|LT|1||
00144002|PulserEquipmentSequence|Pulser Equipment Sequence|SQ|1||
00144004|PulserType|Pulser Type|CS|1||
00144006|PulserNotes|Pulser Notes|LT|1||
00144008|ReceiverEquipmentSequence|Receiver Equipment Sequence|SQ|1||
0014400A|AmplifierType|Amplifier Type|CS|1||
0014400C|ReceiverNotes|Receiver Notes|LT|1||
0014400E|PreAmplifierEquipmentSequence|Pre-Amplifier Equipment Sequence|SQ|1||
0014400F|PreAmplifierNotes|Pre-Amplifier Notes|LT|1||
00144010|TransmitTransducerSequence|Transmit Transducer Sequence|SQ|1||
00144011|ReceiveTransducerSequence|Receive Transducer Sequence|SQ|1||
00144012|NumberOfElements|Number of Elements|US|1||
00144013|ElementShape|Element Shape|CS|1||
00144014|ElementDimensionA|Element Dimension A|DS|1||
00144015|ElementDimensionB|Element Dimension B|DS|1||
00144016|ElementPitchA|Element Pitch A|DS|1||
00144017|MeasuredBeamDimensionA|Measured Beam Dimension A|DS|1||
00144018|MeasuredBeamDimensionB|Measured Beam Dimension B|DS|1||
00144019|LocationOfMeasuredBeamDiameter|Location of Measured Beam Diameter|DS|1||
0014401A|NominalFrequency|Nominal Frequency|DS|1||
0014401B|MeasuredCenterFrequency|Measured Center Frequency|DS|1||
0014401C|MeasuredBandwidth|Measured Bandwidth|DS|1||
0014401D|ElementPitchB|Element Pitch B|DS|1||
00144020|PulserSettingsSequence|Pulser Settings Sequence|SQ|1||
00144022|PulseWidth|Pulse Width|DS|1||
00144024|ExcitationFrequency|Excitation Frequency|DS|1||
00144026|ModulationType|Modulation Type|CS|1||
00144028|Damping|Damping|DS|1||
00144030|ReceiverSettingsSequence|Receiver Settings Sequence|SQ|1||
00144031|AcquiredSoundpathLength|Acquired Soundpath Length|DS|1||
00144032|AcquisitionCompressionType|Acquisition Compression Type|CS|1||
00144033|AcquisitionSampleSize|Acquisition Sample Size|IS|1||
00144034|RectifierSmoothing|Rectifier Smoothing|DS|1||
00144035|DACSequence|DAC Sequence|SQ|1||
00144036|DACType|DAC Type|CS|1||
00144038|DACGainPoints|DAC Gain Points|DS|1-n||
0014403A|DACTimePoints|DAC Time Points|DS|1-n||
0014403C|DACAmplitude|DAC Amplitude|DS|1-n||
00144040|PreAmplifierSettingsSequence|Pre-Amplifier Settings Sequence|SQ|1||
00144050|TransmitTransducerSettingsSequence|Transmit Transducer Settings Sequence|SQ|1||
00144051|ReceiveTransducerSettingsSequence|Receive Transducer Settings Sequence|SQ|1||
00144052|IncidentAngle|Incident Angle|DS|1||
00144054|CouplingTechnique|Coupling Technique|ST|1||
00144056|CouplingMedium|Coupling Medium|ST|1||
00144057|CouplingVelocity|Coupling Velocity|DS|1||
00144058|ProbeCenterLocationX|Probe Center Location X|DS|1||
00144059|ProbeCenterLocationZ|Probe Center Location Z|DS|1||
0014405A|SoundPathLength|Sound Path Length|DS|1||
0014405C|DelayLawIdentifier|Delay Law Identifier|ST|1||
00144060|GateSettingsSequence|Gate Settings Sequence|SQ|1||
00144062|GateThreshold|Gate Threshold|DS|1||
00144064|VelocityOfSound|Velocity of Sound|DS|1||
00144070|CalibrationSettingsSequence|Calibration Settings Sequence|SQ|1||
00144072|CalibrationProcedure|Calibration Procedure|ST|1||
00144074|ProcedureVersion|Procedure Version|SH|1||
00144076|ProcedureCreationDate|Procedure Creation Date|DA|1||
00144078|ProcedureExpirationDate|Procedure Expiration Date|DA|1||
0014407A|ProcedureLastModifiedDate|Procedure Last Modified Date|DA|1||
0014407C|CalibrationTime|Calibration Time|TM|1-n||
0014407E|CalibrationDate|Calibration Date|DA|1-n||
00144080|ProbeDriveEquipmentSequence|Probe Drive Equipment Sequence|SQ|1||
00144081|DriveType|Drive Type|CS|1||
00144082|ProbeDriveNotes|Probe Drive Notes|LT|1||
00144083|DriveProbeSequence|Drive Probe Sequence|SQ|1||
00144084|ProbeInductance|Probe Inductance|DS|1||
00144085|ProbeResistance|Probe Resistance|DS|1||
00144086|ReceiveProbeSequence|Receive Probe Sequence|SQ|1||
00144087|ProbeDriveSettingsSequence|Probe Drive Settings Sequence|SQ|1||
00144088|BridgeResistors|Bridge Resistors|DS|1||
00144089|ProbeOrientationAngle|Probe Orientation Angle|DS|1||
0014408B|UserSelectedGainY|User Selected Gain Y|DS|1||
0014408C|UserSelectedPhase|User Selected Phase|DS|1||
0014408D|UserSelectedOffsetX|User Selected Offset X|DS|1||
0014408E|UserSelectedOffsetY|User Selected Offset Y|DS|1||
00144091|ChannelSettingsSequence|Channel Settings Sequence|SQ|1||
00144092|ChannelThreshold|Channel Threshold|DS|1||
0014409A|ScannerSettingsSequence|Scanner Settings Sequence|SQ|1||
0014409B|ScanProcedure|Scan Procedure|ST|1||
0014409C|TranslationRateX|Translation Rate X|DS|1||
0014409D|TranslationRateY|Translation Rate Y|DS|1||
0014409F|ChannelOverlap|Channel Overlap|DS|1||
001440A0|ImageQualityIndicatorType|Image Quality Indicator Type|LO|1-n||
001440A1|ImageQualityIndicatorMaterial|Image Quality Indicator Material|LO|1-n||
001440A2|ImageQualityIndicatorSize|Image Quality Indicator Size|LO|1-n||
00144101|WaveDimensionsDefinitionSequence|Wave Dimensions Definition Sequence|SQ|1||
00144102|WaveDimensionNumber|Wave Dimension Number|US|1||
00144103|WaveDimensionDescription|Wave Dimension Description|LO|1||
00144104|WaveDimensionUnit|Wave Dimension Unit|US|1||
00144105|WaveDimensionValueType|Wave Dimension Value Type|CS|1||
00144106|WaveDimensionValuesSequence|Wave Dimension Values Sequence|SQ|1-n||
00144107|ReferencedWaveDimension|Referenced Wave Dimension|US|1||
00144108|IntegerNumericValue|Integer Numeric Value|SL|1||
00144109|ByteNumericValue|Byte Numeric Value|OB|1||
0014410A|ShortNumericValue|Short Numeric Value|OW|1||
0014410B|SinglePrecisionFloatingPointNumericValue|Single Precision Floating Point Numeric Value|OF|1||
0014410C|DoublePrecisionFloatingPointNumericValue|Double Precision Floating Point Numeric Value|OD|1||
00145002|LINACEnergy|LINAC Energy|IS|1||
00145004|LINACOutput|LINAC Output|IS|1||
00145100|ActiveAperture|Active Aperture|US|1||
00145101|TotalAperture|Total Aperture|DS|1||
00145102|ApertureElevation|Aperture Elevation|DS|1||
00145103|MainLobeAngle|Main Lobe Angle|DS|1||
00145104|MainRoofAngle|Main Roof Angle|DS|1||
00145105|ConnectorType|Connector Type|CS|1||
00145106|WedgeModelNumber|Wedge Model Number|SH|1||
00145107|WedgeAngleFloat|Wedge Angle Float|DS|1||
00145108|WedgeRoofAngle|Wedge Roof Angle|DS|1||
00145109|WedgeElement1Position|Wedge Element 1 Position|CS|1||
0014510A|WedgeMaterialVelocity|Wedge Material Velocity|DS|1||
0014510B|WedgeMaterial|Wedge Material|SH|1||
0014510C|WedgeOffsetZ|Wedge Offset Z|DS|1||
0014510D|WedgeOriginOffsetX|Wedge Origin Offset X|DS|1||
0014510E|WedgeTimeDelay|Wedge Time Delay|DS|1||
0014510F|WedgeName|Wedge Name|SH|1||
00145110|WedgeManufacturerName|Wedge Manufacturer Name|SH|1||
00145111|WedgeDescription|Wedge Description|LO|1||
00145112|NominalBeamAngle|Nominal Beam Angle|DS|1||
00145113|WedgeOffsetX|Wedge Offset X|DS|1||
00145114|WedgeOffsetY|Wedge Offset Y|DS|1||
00145115|WedgeTotalLength|Wedge Total Length|DS|1||
00145116|WedgeInContactLength|Wedge In Contact Length|DS|1||
00145117|WedgeFrontGap|Wedge Front Gap|DS|1||
00145118|WedgeTotalHeight|Wedge Total Height|DS|1||
00145119|WedgeFrontHeight|Wedge Front Height|DS|1||
0014511A|WedgeRearHeight|Wedge Rear Height|DS|1||
0014511B|WedgeTotalWidth|Wedge Total Width|DS|1||
0014511C|WedgeInContactWidth|Wedge In Contact Width|DS|1||
0014511D|WedgeChamferHeight|Wedge Chamfer Height|DS|1||
0014511E|WedgeCurve|Wedge Curve|CS|1||
0014511F|RadiusAlongWedge|Radius Along the Wedge|DS|1||
00146001|ThermalCameraSettingsSequence|Thermal Camera Settings Sequence|SQ|1||
00146002|AcquisitionFrameRate|Acquisition Frame Rate|DS|1||
00146003|IntegrationTime|Integration Time|DS|1||
00146004|NumberOfCalibrationFrames|Number of Calibration Frames|DS|1||
00146005|NumberOfRowsInFullAcquisitionImage|Number of Rows in Full Acquisition Image|DS|1||
00146006|NumberOfColumnsInFullAcquisitionImage|Number Of Columns in Full Acquisition Image|DS|1||
00146007|ThermalSourceSettingsSequence|Thermal Source Settings Sequence|SQ|1||
00146008|SourceHorizontalPitch|Source Horizontal Pitch|DS|1||
00146009|SourceVerticalPitch|Source Vertical Pitch|DS|1||
0014600A|SourceHorizontalScanSpeed|Source Horizontal Scan Speed|DS|1||
0014600B|ThermalSourceModulationFrequency|Thermal Source Modulation Frequency|DS|1||
0014600C|InductionSourceSettingSequence|Induction Source Setting Sequence|SQ|1||
0014600D|CoilFrequency|Coil Frequency|DS|1||
0014600E|CurrentAmplitudeAcrossCoil|Current Amplitude Across Coil|DS|1||
0014600F|FlashSourceSettingSequence|Flash Source Setting Sequence|SQ|1||
00146010|FlashDuration|Flash Duration|DS|1||
00146011|FlashFrameNumber|Flash Frame Number|DS|1-n||
00146012|LaserSourceSettingSequence|Laser Source Setting Sequence|SQ|1||
00146013|HorizontalLaserSpotDimension|Horizontal Laser Spot Dimension|DS|1||
00146014|VerticalLaserSpotDimension|Vertical Laser Spot Dimension|DS|1||
00146015|LaserWavelength|Laser Wavelength|DS|1||
00146016|LaserPower|Laser Power|DS|1||
00146017|ForcedGasSettingSequence|Forced Gas Setting Sequence|SQ|1||
00146018|VibrationSourceSettingSequence|Vibration Source Setting Sequence|SQ|1||
00146019|VibrationExcitationFrequency|Vibration Excitation Frequency|DS|1||
0014601A|VibrationExcitationVoltage|Vibration Excitation Voltage|DS|1||
0014601B|ThermographyDataCaptureMethod|Thermography Data Capture Method|CS|1||
0014601C|ThermalTechnique|Thermal Technique|CS|1||
0014601D|ThermalCameraCoreSequence|Thermal Camera Core Sequence|SQ|1||
0014601E|DetectorWavelengthRange|Detector Wavelength Range|CS|1||
0014601F|ThermalCameraCalibrationType|Thermal Camera Calibration Type|CS|1||
00146020|AcquisitionImageCounter|Acquisition Image Counter|UV|1||
00146021|FrontPanelTemperature|Front Panel Temperature|DS|1||
00146022|AirGapTemperature|Air Gap Temperature|DS|1||
00146023|VerticalPixelSize|Vertical Pixel Size|DS|1||
00146024|HorizontalPixelSize|Horizontal Pixel Size|DS|1||
00146025|DataStreamingProtocol|Data Streaming Protocol|ST|1-n||
00146026|LensSequence|Lens Sequence|SQ|1||
00146027|FieldOfView|Field of View|DS|1||
00146028|LensFilterManufacturer|Lens Filter Manufacturer|LO|1||
00146029|CutoffFilterType|Cutoff Filter Type|CS|1||
0014602A|LensFilterCutOffWavelength|Lens Filter Cut-Off Wavelength|DS|1-n||
0014602B|ThermalSourceSequence|Thermal Source Sequence|SQ|1||
0014602C|ThermalSourceMotionState|Thermal Source Motion State|CS|1||
0014602D|ThermalSourceMotionType|Thermal Source Motion Type|CS|1||
0014602E|InductionHeatingSequence|Induction Heating Sequence|SQ|1||
0014602F|CoilConfigurationID|Coil Configuration ID|ST|1||
00146030|NumberOfTurnsInCoil|Number of Turns in Coil|DS|1||
00146031|ShapeOfIndividualTurn|Shape of Individual Turn|CS|1||
00146032|SizeOfIndividualTurn|Size of Individual Turn|DS|1-n||
00146033|DistanceBetweenTurns|Distance Between Turns|DS|1-n||
00146034|FlashHeatingSequence|Flash Heating Sequence|SQ|1||
00146035|NumberOfLamps|Number of Lamps|DS|1||
00146036|FlashSynchronizationProtocol|Flash Synchronization Protocol|ST|1||
00146037|FlashModificationStatus|Flash Modification Status|CS|1||
00146038|LaserHeatingSequence|Laser Heating Sequence|SQ|1||
00146039|LaserManufacturer|Laser Manufacturer|LO|1||
0014603A|LaserModelNumber|Laser Model Number|LO|1||
0014603B|LaserTypeDescription|Laser Type Description|ST|1||
0014603C|ForcedGasHeatingSequence|Forced Gas Heating Sequence|SQ|1||
0014603D|GasUsedForHeatingCoolingPart|Gas Used for Heating/Cooling Part|LO|1||
0014603E|VibrationSonicHeatingSequence|Vibration/Sonic Heating Sequence|SQ|1||
0014603F|ProbeManufacturer|Probe Manufacturer|LO|1||
00146040|ProbeModelNumber|Probe Model Number|LO|1||
00146041|ApertureSize|Aperture Size|DS|1||
00146042|ProbeResonantFrequency|Probe Resonant Frequency|DS|1||
00146043|HeatSourceDescription|Heat Source Description|UT|1||
00146044|SurfacePreparationWithOpticalCoating|Surface Preparation with Optical Coating|CS|1||
00146045|OpticalCoatingType|Optical Coating Type|ST|1||
00146046|ThermalConductivityOfExposedSurface|Thermal Conductivity of Exposed Surface|DS|1||
00146047|MaterialDensity|Material Density|DS|1||
00146048|SpecificHeatOfInspectionSurface|Specific Heat of Inspection Surface|DS|1||
00146049|EmissivityOfInspectionSurface|Emissivity of Inspection Surface|DS|1||
0014604A|ElectromagneticClassificationOfInspectionSurface|Electromagnetic Classification of Inspection Surface|CS|1-n||
0014604C|MovingWindowSize|Moving Window Size|DS|1||
0014604D|MovingWindowType|Moving Window Type|CS|1||
0014604E|MovingWindowWeights|Moving Window Weights|DS|1-n||
0014604F|MovingWindowPitch|Moving Window Pitch|DS|1||
00146050|MovingWindowPaddingScheme|Moving Window Padding Scheme|CS|1||
00146051|MovingWindowPaddingLength|Moving Window Padding Length|DS|1||
00146052|SpatialFilteringParametersSequence|Spatial Filtering Parameters Sequence|SQ|1||
00146053|SpatialFilteringScheme|Spatial Filtering Scheme|CS|1||
00146056|HorizontalMovingWindowSize|Horizontal Moving Window Size|DS|1||
00146057|VerticalMovingWindowSize|Vertical Moving Window Size|DS|1||
00146059|PolynomialFittingSequence|Polynomial Fitting Sequence|SQ|1||
0014605A|FittingDataType|Fitting Data Type|CS|1-n||
0014605B|OperationOnTimeAxisBeforeFitting|Operation on Time Axis Before Fitting|CS|1||
0014605C|OperationOnPixelIntensityBeforeFitting|Operation on Pixel Intensity Before Fitting|CS|1||
0014605D|OrderOfPolynomial|Order of Polynomial|DS|1||
0014605E|IndependentVariableForPolynomialFit|Independent Variable for Polynomial Fit|CS|1||
0014605F|PolynomialCoefficients|PolynomialCoefficients|DS|1-n||
00146060|ThermographyPixelDataUnit|Thermography Pixel Data Unit|CS|1||
00160001|WhitePoint|White Point|DS|1||
00160002|PrimaryChromaticities|Primary Chromaticities|DS|3||
00160003|BatteryLevel|Battery Level|UT|1||
00160004|ExposureTimeInSeconds|Exposure Time in Seconds|DS|1||
00160005|FNumber|F-Number|DS|1||
00160006|OECFRows|OECF Rows|IS|1||
00160007|OECFColumns|OECF Columns|IS|1||
00160008|OECFColumnNames|OECF Column Names|UC|1-n||
00160009|OECFValues|OECF Values|DS|1-n||
0016000A|SpatialFrequencyResponseRows|Spatial Frequency Response Rows|IS|1||
0016000B|SpatialFrequencyResponseColumns|Spatial Frequency Response Columns|IS|1||
0016000C|SpatialFrequencyResponseColumnNames|Spatial Frequency Response Column Names|UC|1-n||
0016000D|SpatialFrequencyResponseValues|Spatial Frequency Response Values|DS|1-n||
0016000E|ColorFilterArrayPatternRows|Color Filter Array Pattern Rows|IS|1||
0016000F|ColorFilterArrayPatternColumns|Color Filter Array Pattern Columns|IS|1||
00160010|ColorFilterArrayPatternValues|Color Filter Array Pattern Values|DS|1-n||
00160011|FlashFiringStatus|Flash Firing Status|US|1||
00160012|FlashReturnStatus|Flash Return Status|US|1||
00160013|FlashMode|Flash Mode|US|1||
00160014|FlashFunctionPresent|Flash Function Present|US|1||
00160015|FlashRedEyeMode|Flash Red Eye Mode|US|1||
00160016|ExposureProgram|Exposure Program|US|1||
00160017|SpectralSensitivity|Spectral Sensitivity|UT|1||
00160018|PhotographicSensitivity|Photographic Sensitivity|IS|1||
00160019|SelfTimerMode|Self Timer Mode|IS|1||
0016001A|SensitivityType|Sensitivity Type|US|1||
0016001B|StandardOutputSensitivity|Standard Output Sensitivity|IS|1||
0016001C|RecommendedExposureIndex|Recommended Exposure Index|IS|1||
0016001D|ISOSpeed|ISO Speed|IS|1||
0016001E|ISOSpeedLatitudeyyy|ISO Speed Latitude yyy|IS|1||
0016001F|ISOSpeedLatitudezzz|ISO Speed Latitude zzz|IS|1||
00160020|EXIFVersion|EXIF Version|UT|1||
00160021|ShutterSpeedValue|Shutter Speed Value|DS|1||
00160022|ApertureValue|Aperture Value|DS|1||
00160023|BrightnessValue|Brightness Value|DS|1||
00160024|ExposureBiasValue|Exposure Bias Value|DS|1||
00160025|MaxApertureValue|Max Aperture Value|DS|1||
00160026|SubjectDistance|Subject Distance|DS|1||
00160027|MeteringMode|Metering Mode|US|1||
00160028|LightSource|Light Source|US|1||
00160029|FocalLength|Focal Length|DS|1||
0016002A|SubjectArea|Subject Area|IS|2-4||
0016002B|MakerNote|Maker Note|OB|1||
00160030|Temperature|Temperature|DS|1||
00160031|Humidity|Humidity|DS|1||
00160032|Pressure|Pressure|DS|1||
00160033|WaterDepth|Water Depth|DS|1||
00160034|Acceleration|Acceleration|DS|1||
00160035|CameraElevationAngle|Camera Elevation Angle|DS|1||
00160036|FlashEnergy|Flash Energy|DS|1-2||
00160037|SubjectLocation|Subject Location|IS|2||
00160038|PhotographicExposureIndex|Photographic Exposure Index|DS|1||
00160039|SensingMethod|Sensing Method|US|1||
0016003A|FileSource|File Source|US|1||
0016003B|SceneType|Scene Type|US|1||
00160041|CustomRendered|Custom Rendered|US|1||
00160042|ExposureMode|Exposure Mode|US|1||
00160043|WhiteBalance|White Balance|US|1||
00160044|DigitalZoomRatio|Digital Zoom Ratio|DS|1||
00160045|FocalLengthIn35mmFilm|Focal Length In 35mm Film|IS|1||
00160046|SceneCaptureType|Scene Capture Type|US|1||
00160047|GainControl|Gain Control|US|1||
00160048|Contrast|Contrast|US|1||
00160049|Saturation|Saturation|US|1||
0016004A|Sharpness|Sharpness|US|1||
0016004B|DeviceSettingDescription|Device Setting Description|OB|1||
0016004C|SubjectDistanceRange|Subject Distance Range|US|1||
0016004D|CameraOwnerName|Camera Owner Name|UT|1||
0016004E|LensSpecification|Lens Specification|DS|4||
0016004F|LensMake|Lens Make|UT|1||
00160050|LensModel|Lens Model|UT|1||
00160051|LensSerialNumber|Lens Serial Number|UT|1||
00160061|InteroperabilityIndex|Interoperability Index|CS|1||
00160062|InteroperabilityVersion|Interoperability Version|OB|1||
00160070|GPSVersionID|GPS Version ID|OB|1||
00160071|GPSLatitudeRef|GPS Latitude Ref|CS|1||
00160072|GPSLatitude|GPS Latitude|DS|3||
00160073|GPSLongitudeRef|GPS Longitude Ref|CS|1||
00160074|GPSLongitude|GPS Longitude|DS|3||
00160075|GPSAltitudeRef|GPS Altitude Ref|US|1||
00160076|GPSAltitude|GPS Altitude|DS|1||
00160077|GPSTimeStamp|GPS Time Stamp|DT|1||
00160078|GPSSatellites|GPS Satellites|UT|1||
00160079|GPSStatus|GPS Status|CS|1||
0016007A|GPSMeasureMode|GPS Measure Mode|CS|1||
0016007B|GPSDOP|GPS DOP|DS|1||
0016007C|GPSSpeedRef|GPS Speed Ref|CS|1||
0016007D|GPSSpeed|GPS Speed|DS|1||
0016007E|GPSTrackRef|GPS Track Ref|CS|1||
0016007F|GPSTrack|GPS Track|DS|1||
00160080|GPSImgDirectionRef|GPS Img Direction Ref|CS|1||
00160081|GPSImgDirection|GPS Img Direction|DS|1||
00160082|GPSMapDatum|GPS Map Datum|UT|1||
00160083|GPSDestLatitudeRef|GPS Dest Latitude Ref|CS|1||
00160084|GPSDestLatitude|GPS Dest Latitude|DS|3||
00160085|GPSDestLongitudeRef|GPS Dest Longitude Ref|CS|1||
00160086|GPSDestLongitude|GPS Dest Longitude|DS|3||
00160087|GPSDestBearingRef|GPS Dest Bearing Ref|CS|1||
00160088|GPSDestBearing|GPS Dest Bearing|DS|1||
00160089|GPSDestDistanceRef|GPS Dest Distance Ref|CS|1||
0016008A|GPSDestDistance|GPS Dest Distance|DS|1||
0016008B|GPSProcessingMethod|GPS Processing Method|OB|1||
0016008C|GPSAreaInformation|GPS Area Information|OB|1||
0016008D|GPSDateStamp|GPS Date Stamp|DT|1||
0016008E|GPSDifferential|GPS Differential|IS|1||
00161001|LightSourcePolarization|Light Source Polarization|CS|1||
00161002|EmitterColorTemperature|Emitter Color Temperature|DS|1||
00161003|ContactMethod|Contact Method|CS|1||
00161004|ImmersionMedia|Immersion Media|CS|1-n||
00161005|OpticalMagnificationFactor|Optical Magnification Factor|DS|1||
00180010|ContrastBolusAgent|Contrast/Bolus Agent|LO|1||
00180012|ContrastBolusAgentSequence|Contrast/Bolus Agent Sequence|SQ|1||
00180013|ContrastBolusT1Relaxivity|Contrast/Bolus T1 Relaxivity|FL|1||
00180014|ContrastBolusAdministrationRouteSequence|Contrast/Bolus Administration Route Sequence|SQ|1||
00180015|BodyPartExamined|Body Part Examined|CS|1||
00180020|ScanningSequence|Scanning Sequence|CS|1-n||
00180021|SequenceVariant|Sequence Variant|CS|1-n||
00180022|ScanOptions|Scan Options|CS|1-n||
00180023|MRAcquisitionType|MR Acquisition Type|CS|1||
00180024|SequenceName|Sequence Name|SH|1||
00180025|AngioFlag|Angio Flag|CS|1||
00180026|InterventionDrugInformationSequence|Intervention Drug Information Sequence|SQ|1||
00180027|InterventionDrugStopTime|Intervention Drug Stop Time|TM|1||
00180028|InterventionDrugDose|Intervention Drug Dose|DS|1||
00180029|InterventionDrugCodeSequence|Intervention Drug Code Sequence|SQ|1||
0018002A|AdditionalDrugSequence|Additional Drug Sequence|SQ|1||
00180030|Radionuclide|Radionuclide|LO|1-n|R|
00180031|Radiopharmaceutical|Radiopharmaceutical|LO|1||
00180032|EnergyWindowCenterline|Energy Window Centerline|DS|1|R|
00180033|EnergyWindowTotalWidth|Energy Window Total Width|DS|1-n|R|
00180034|InterventionDrugName|Intervention Drug Name|LO|1||
00180035|InterventionDrugStartTime|Intervention Drug Start Time|TM|1||
00180036|InterventionSequence|Intervention Sequence|SQ|1||
00180037|TherapyType|Therapy Type|CS|1|R|
00180038|InterventionStatus|Intervention Status|CS|1||
00180039|TherapyDescription|Therapy Description|CS|1|R|
0018003A|InterventionDescription|Intervention Description|ST|1||
00180040|CineRate|Cine Rate|IS|1||
00180042|InitialCineRunState|Initial Cine Run State|CS|1||
00180050|SliceThickness|Slice Thickness|DS|1||
00180060|KVP|KVP|DS|1||
00180061|||DS|1|R|
00180070|CountsAccumulated|Counts Accumulated|IS|1||
00180071|AcquisitionTerminationCondition|Acquisition Termination Condition|CS|1||
00180072|EffectiveDuration|Effective Duration|DS|1||
00180073|AcquisitionStartCondition|Acquisition Start Condition|CS|1||
00180074|AcquisitionStartConditionData|Acquisition Start Condition Data|IS|1||
00180075|AcquisitionTerminationConditionData|Acquisition Termination Condition Data|IS|1||
00180080|RepetitionTime|Repetition Time|DS|1||
00180081|EchoTime|Echo Time|DS|1||
00180082|InversionTime|Inversion Time|DS|1||
00180083|NumberOfAverages|Number of Averages|DS|1||
00180084|ImagingFrequency|Imaging Frequency|DS|1||
00180085|ImagedNucleus|Imaged Nucleus|SH|1||
00180086|EchoNumbers|Echo Number(s)|IS|1-n||
00180087|MagneticFieldStrength|Magnetic Field Strength|DS|1||
00180088|SpacingBetweenSlices|Spacing Between Slices|DS|1||
00180089|NumberOfPhaseEncodingSteps|Number of Phase Encoding Steps|IS|1||
00180090|DataCollectionDiameter|Data Collection Diameter|DS|1||
00180091|EchoTrainLength|Echo Train Length|IS|1||
00180093|PercentSampling|Percent Sampling|DS|1||
00180094|PercentPhaseFieldOfView|Percent Phase Field of View|DS|1||
00180095|PixelBandwidth|Pixel Bandwidth|DS|1||
00181000|DeviceSerialNumber|Device Serial Number|LO|1||
00181002|DeviceUID|Device UID|UI|1||
00181003|DeviceID|Device ID|LO|1||
00181004|PlateID|Plate ID|LO|1||
00181005|GeneratorID|Generator ID|LO|1||
00181006|GridID|Grid ID|LO|1||
00181007|CassetteID|Cassette ID|LO|1||
00181008|GantryID|Gantry ID|LO|1||
00181009|UniqueDeviceIdentifier|Unique Device Identifier|UT|1||
0018100A|UDISequence|UDI Sequence|SQ|1||
0018100B|ManufacturerDeviceClassUID|Manufacturer's Device Class UID|UI|1-n||
00181010|SecondaryCaptureDeviceID|Secondary Capture Device ID|LO|1||
00181011|HardcopyCreationDeviceID|Hardcopy Creation Device ID|LO|1|R|
00181012|DateOfSecondaryCapture|Date of Secondary Capture|DA|1||
00181014|TimeOfSecondaryCapture|Time of Secondary Capture|TM|1||
00181016|SecondaryCaptureDeviceManufacturer|Secondary Capture Device Manufacturer|LO|1||
00181017|HardcopyDeviceManufacturer|Hardcopy Device Manufacturer|LO|1|R|
00181018|SecondaryCaptureDeviceManufacturerModelName|Secondary Capture Device Manufacturer's Model Name|LO|1||
00181019|SecondaryCaptureDeviceSoftwareVersions|Secondary Capture Device Software Versions|LO|1-n||
0018101A|HardcopyDeviceSoftwareVersion|Hardcopy Device Software Version|LO|1-n|R|
0018101B|HardcopyDeviceManufacturerModelName|Hardcopy Device Manufacturer's Model Name|LO|1|R|
00181020|SoftwareVersions|Software Versions|LO|1-n||
00181022|VideoImageFormatAcquired|Video Image Format Acquired|SH|1||
00181023|DigitalImageFormatAcquired|Digital Image Format Acquired|LO|1||
00181030|ProtocolName|Protocol Name|LO|1||
00181040|ContrastBolusRoute|Contrast/Bolus Route|LO|1||
00181041|ContrastBolusVolume|Contrast/Bolus Volume|DS|1||
00181042|ContrastBolusStartTime|Contrast/Bolus Start Time|TM|1||
00181043|ContrastBolusStopTime|Contrast/Bolus Stop Time|TM|1||
00181044|ContrastBolusTotalDose|Contrast/Bolus Total Dose|DS|1||
00181045|SyringeCounts|Syringe Counts|IS|1||
00181046|ContrastFlowRate|Contrast Flow Rate|DS|1-n||
00181047|ContrastFlowDuration|Contrast Flow Duration|DS|1-n||
00181048|ContrastBolusIngredient|Contrast/Bolus Ingredient|CS|1||
00181049|ContrastBolusIngredientConcentration|Contrast/Bolus Ingredient Concentration|DS|1||
00181050|SpatialResolution|Spatial Resolution|DS|1||
00181060|TriggerTime|Trigger Time|DS|1||
00181061|TriggerSourceOrType|Trigger Source or Type|LO|1||
00181062|NominalInterval|Nominal Interval|IS|1||
00181063|FrameTime|Frame Time|DS|1||
00181064|CardiacFramingType|Cardiac Framing Type|LO|1||
00181065|FrameTimeVector|Frame Time Vector|DS|1-n||
00181066|FrameDelay|Frame Delay|DS|1||
00181067|ImageTriggerDelay|Image Trigger Delay|DS|1||
00181068|MultiplexGroupTimeOffset|Multiplex Group Time Offset|DS|1||
00181069|TriggerTimeOffset|Trigger Time Offset|DS|1||
0018106A|SynchronizationTrigger|Synchronization Trigger|CS|1||
0018106C|SynchronizationChannel|Synchronization Channel|US|2||
0018106E|TriggerSamplePosition|Trigger Sample Position|UL|1||
00181070|RadiopharmaceuticalRoute|Radiopharmaceutical Route|LO|1||
00181071|RadiopharmaceuticalVolume|Radiopharmaceutical Volume|DS|1||
00181072|RadiopharmaceuticalStartTime|Radiopharmaceutical Start Time|TM|1||
00181073|RadiopharmaceuticalStopTime|Radiopharmaceutical Stop Time|TM|1||
00181074|RadionuclideTotalDose|Radionuclide Total Dose|DS|1||
00181075|RadionuclideHalfLife|Radionuclide Half Life|DS|1||
00181076|RadionuclidePositronFraction|Radionuclide Positron Fraction|DS|1||
00181077|RadiopharmaceuticalSpecificActivity|Radiopharmaceutical Specific Activity|DS|1||
00181078|RadiopharmaceuticalStartDateTime|Radiopharmaceutical Start DateTime|DT|1||
00181079|RadiopharmaceuticalStopDateTime|Radiopharmaceutical Stop DateTime|DT|1||
00181080|BeatRejectionFlag|Beat Rejection Flag|CS|1||
00181081|LowRRValue|Low R-R Value|IS|1||
00181082|HighRRValue|High R-R Value|IS|1||
00181083|IntervalsAcquired|Intervals Acquired|IS|1||
00181084|IntervalsRejected|Intervals Rejected|IS|1||
00181085|PVCRejection|PVC Rejection|LO|1||
00181086|SkipBeats|Skip Beats|IS|1||
00181088|HeartRate|Heart Rate|IS|1||
00181090|CardiacNumberOfImages|Cardiac Number of Images|IS|1||
00181094|TriggerWindow|Trigger Window|IS|1||
00181100|ReconstructionDiameter|Reconstruction Diameter|DS|1||
00181110|DistanceSourceToDetector|Distance Source to Detector|DS|1||
00181111|DistanceSourceToPatient|Distance Source to Patient|DS|1||
00181114|EstimatedRadiographicMagnificationFactor|Estimated Radiographic Magnification Factor|DS|1||
00181120|GantryDetectorTilt|Gantry/Detector Tilt|DS|1||
00181121|GantryDetectorSlew|Gantry/Detector Slew|DS|1||
00181130|TableHeight|Table Height|DS|1||
00181131|TableTraverse|Table Traverse|DS|1||
00181134|TableMotion|Table Motion|CS|1||
00181135|TableVerticalIncrement|Table Vertical Increment|DS|1-n||
00181136|TableLateralIncrement|Table Lateral Increment|DS|1-n||
00181137|TableLongitudinalIncrement|Table Longitudinal Increment|DS|1-n||
00181138|TableAngle|Table Angle|DS|1||
0018113A|TableType|Table Type|CS|1||
00181140|RotationDirection|Rotation Direction|CS|1||
00181141|AngularPosition|Angular Position|DS|1|R|
00181142|RadialPosition|Radial Position|DS|1-n||
00181143|ScanArc|Scan Arc|DS|1||
00181144|AngularStep|Angular Step|DS|1||
00181145|CenterOfRotationOffset|Center of Rotation Offset|DS|1||
00181146|RotationOffset|Rotation Offset|DS|1-n|R|
00181147|FieldOfViewShape|Field of View Shape|CS|1||
00181149|FieldOfViewDimensions|Field of View Dimension(s)|IS|1-2||
00181150|ExposureTime|Exposure Time|IS|1||
00181151|XRayTubeCurrent|X-Ray Tube Current|IS|1||
00181152|Exposure|Exposure|IS|1||
00181153|ExposureInuAs|Exposure in µAs|IS|1||
00181154|AveragePulseWidth|Average Pulse Width|DS|1||
00181155|RadiationSetting|Radiation Setting|CS|1||
00181156|RectificationType|Rectification Type|CS|1||
0018115A|RadiationMode|Radiation Mode|CS|1||
0018115E|ImageAndFluoroscopyAreaDoseProduct|Image and Fluoroscopy Area Dose Product|DS|1||
00181160|FilterType|Filter Type|SH|1||
00181161|TypeOfFilters|Type of Filters|LO|1-n||
00181162|IntensifierSize|Intensifier Size|DS|1||
00181164|ImagerPixelSpacing|Imager Pixel Spacing|DS|2||
00181166|Grid|Grid|CS|1-n||
00181170|GeneratorPower|Generator Power|IS|1||
00181180|CollimatorGridName|Collimator/grid Name|SH|1||
00181181|CollimatorType|Collimator Type|CS|1||
00181182|FocalDistance|Focal Distance|IS|1-2||
00181183|XFocusCenter|X Focus Center|DS|1-2||
00181184|YFocusCenter|Y Focus Center|DS|1-2||
00181190|FocalSpots|Focal Spot(s)|DS|1-n||
00181191|AnodeTargetMaterial|Anode Target Material|CS|1||
001811A0|BodyPartThickness|Body Part Thickness|DS|1||
001811A2|CompressionForce|Compression Force|DS|1||
001811A3|CompressionPressure|Compression Pressure|DS|1||
001811A4|PaddleDescription|Paddle Description|LO|1||
001811A5|CompressionContactArea|Compression Contact Area|DS|1||
001811B0|AcquisitionMode|Acquisition Mode|LO|1||
001811B1|DoseModeName|Dose Mode Name|LO|1||
001811B2|AcquiredSubtractionMaskFlag|Acquired Subtraction Mask Flag|CS|1||
001811B3|FluoroscopyPersistenceFlag|Fluoroscopy Persistence Flag|CS|1||
001811B4|FluoroscopyLastImageHoldPersistenceFlag|Fluoroscopy Last Image Hold Persistence Flag|CS|1||
001811B5|UpperLimitNumberOfPersistentFluoroscopyFrames|Upper Limit Number Of Persistent Fluoroscopy Frames|IS|1||
001811B6|ContrastBolusAutoInjectionTriggerFlag|Contrast/Bolus Auto Injection Trigger Flag|CS|1||
001811B7|ContrastBolusInjectionDelay|Contrast/Bolus Injection Delay|FD|1||
001811B8|XAAcquisitionPhaseDetailsSequence|XA Acquisition Phase Details Sequence|SQ|1||
001811B9|XAAcquisitionFrameRate|XA Acquisition Frame Rate|FD|1||
001811BA|XAPlaneDetailsSequence|XA Plane Details Sequence|SQ|1||
001811BB|AcquisitionFieldOfViewLabel|Acquisition Field of View Label|LO|1||
001811BC|XRayFilterDetailsSequence|X-Ray Filter Details Sequence|SQ|1||
001811BD|XAAcquisitionDuration|XA Acquisition Duration|FD|1||
001811BE|ReconstructionPipelineType|Reconstruction Pipeline Type|CS|1||
001811BF|ImageFilterDetailsSequence|Image Filter Details Sequence|SQ|1||
001811C0|AppliedMaskSubtractionFlag|Applied Mask Subtraction Flag|CS|1||
001811C1|RequestedSeriesDescriptionCodeSequence|Requested Series Description Code Sequence|SQ|1||
00181200|DateOfLastCalibration|Date of Last Calibration|DA|1-n||
00181201|TimeOfLastCalibration|Time of Last Calibration|TM|1-n||
00181202|DateTimeOfLastCalibration|DateTime of Last Calibration|DT|1||
00181203|CalibrationDateTime|Calibration DateTime|DT|1||
00181204|DateOfManufacture|Date of Manufacture|DA|1||
00181205|DateOfInstallation|Date of Installation|DA|1||
00181210|ConvolutionKernel|Convolution Kernel|SH|1-n||
00181240|UpperLowerPixelValues|Upper/Lower Pixel Values|IS|1-n|R|
00181242|ActualFrameDuration|Actual Frame Duration|IS|1||
00181243|CountRate|Count Rate|IS|1||
00181244|PreferredPlaybackSequencing|Preferred Playback Sequencing|US|1||
00181250|ReceiveCoilName|Receive Coil Name|SH|1||
00181251|TransmitCoilName|Transmit Coil Name|SH|1||
00181260|PlateType|Plate Type|SH|1||
00181261|PhosphorType|Phosphor Type|LO|1||
00181271|WaterEquivalentDiameter|Water Equivalent Diameter|FD|1||
00181272|WaterEquivalentDiameterCalculationMethodCodeSequence|Water Equivalent Diameter Calculation Method Code Sequence|SQ|1||
00181300|ScanVelocity|Scan Velocity|DS|1||
00181301|WholeBodyTechnique|Whole Body Technique|CS|1-n||
00181302|ScanLength|Scan Length|IS|1||
00181310|AcquisitionMatrix|Acquisition Matrix|US|4||
00181312|InPlanePhaseEncodingDirection|In-plane Phase Encoding Direction|CS|1||
00181314|FlipAngle|Flip Angle|DS|1||
00181315|VariableFlipAngleFlag|Variable Flip Angle Flag|CS|1||
00181316|SAR|SAR|DS|1||
00181318|dBdt|dB/dt|DS|1||
00181320|B1rms|B1rms|FL|1||
00181400|AcquisitionDeviceProcessingDescription|Acquisition Device Processing Description|LO|1||
00181401|AcquisitionDeviceProcessingCode|Acquisition Device Processing Code|LO|1||
00181402|CassetteOrientation|Cassette Orientation|CS|1||
00181403|CassetteSize|Cassette Size|CS|1||
00181404|ExposuresOnPlate|Exposures on Plate|US|1||
00181405|RelativeXRayExposure|Relative X-Ray Exposure|IS|1||
00181411|ExposureIndex|Exposure Index|DS|1||
00181412|TargetExposureIndex|Target Exposure Index|DS|1||
00181413|DeviationIndex|Deviation Index|DS|1||
00181450|ColumnAngulation|Column Angulation|DS|1||
00181460|TomoLayerHeight|Tomo Layer Height|DS|1||
00181470|TomoAngle|Tomo Angle|DS|1||
00181480|TomoTime|Tomo Time|DS|1||
00181490|TomoType|Tomo Type|CS|1||
00181491|TomoClass|Tomo Class|CS|1||
00181495|NumberOfTomosynthesisSourceImages|Number of Tomosynthesis Source Images|IS|1||
00181500|PositionerMotion|Positioner Motion|CS|1||
00181508|PositionerType|Positioner Type|CS|1||
00181510|PositionerPrimaryAngle|Positioner Primary Angle|DS|1||
00181511|PositionerSecondaryAngle|Positioner Secondary Angle|DS|1||
00181520|PositionerPrimaryAngleIncrement|Positioner Primary Angle Increment|DS|1-n||
00181521|PositionerSecondaryAngleIncrement|Positioner Secondary Angle Increment|DS|1-n||
00181530|DetectorPrimaryAngle|Detector Primary Angle|DS|1||
00181531|DetectorSecondaryAngle|Detector Secondary Angle|DS|1||
00181600|ShutterShape|Shutter Shape|CS|1-3||
00181602|ShutterLeftVerticalEdge|Shutter Left Vertical Edge|IS|1||
00181604|ShutterRightVerticalEdge|Shutter Right Vertical Edge|IS|1||
00181606|ShutterUpperHorizontalEdge|Shutter Upper Horizontal Edge|IS|1||
00181608|ShutterLowerHorizontalEdge|Shutter Lower Horizontal Edge|IS|1||
00181610|CenterOfCircularShutter|Center of Circular Shutter|IS|2||
00181612|RadiusOfCircularShutter|Radius of Circular Shutter|IS|1||
00181620|VerticesOfThePolygonalShutter|Vertices of the Polygonal Shutter|IS|2-2n||
00181622|ShutterPresentationValue|Shutter Presentation Value|US|1||
00181623|ShutterOverlayGroup|Shutter Overlay Group|US|1||
00181624|ShutterPresentationColorCIELabValue|Shutter Presentation Color CIELab Value|US|3||
00181630|OutlineShapeType|Outline Shape Type|CS|1||
00181631|OutlineLeftVerticalEdge|Outline Left Vertical Edge|FD|1||
00181632|OutlineRightVerticalEdge|Outline Right Vertical Edge|FD|1||
00181633|OutlineUpperHorizontalEdge|Outline Upper Horizontal Edge|FD|1||
00181634|OutlineLowerHorizontalEdge|Outline Lower Horizontal Edge|FD|1||
00181635|CenterOfCircularOutline|Center of Circular Outline|FD|2||
00181636|DiameterOfCircularOutline|Diameter of Circular Outline|FD|1||
00181637|NumberOfPolygonalVertices|Number of Polygonal Vertices|UL|1||
00181638|VerticesOfThePolygonalOutline|Vertices of the Polygonal Outline|OF|1||
00181700|CollimatorShape|Collimator Shape|CS|1-3||
00181702|CollimatorLeftVerticalEdge|Collimator Left Vertical Edge|IS|1||
00181704|CollimatorRightVerticalEdge|Collimator Right Vertical Edge|IS|1||
00181706|CollimatorUpperHorizontalEdge|Collimator Upper Horizontal Edge|IS|1||
00181708|CollimatorLowerHorizontalEdge|Collimator Lower Horizontal Edge|IS|1||
00181710|CenterOfCircularCollimator|Center of Circular Collimator|IS|2||
00181712|RadiusOfCircularCollimator|Radius of Circular Collimator|IS|1||
00181720|VerticesOfThePolygonalCollimator|Vertices of the Polygonal Collimator|IS|2-2n||
00181800|AcquisitionTimeSynchronized|Acquisition Time Synchronized|CS|1||
00181801|TimeSource|Time Source|SH|1||
00181802|TimeDistributionProtocol|Time Distribution Protocol|CS|1||
00181803|NTPSourceAddress|NTP Source Address|LO|1||
00182001|PageNumberVector|Page Number Vector|IS|1-n||
00182002|FrameLabelVector|Frame Label Vector|SH|1-n||
00182003|FramePrimaryAngleVector|Frame Primary Angle Vector|DS|1-n||
00182004|FrameSecondaryAngleVector|Frame Secondary Angle Vector|DS|1-n||
00182005|SliceLocationVector|Slice Location Vector|DS|1-n||
00182006|DisplayWindowLabelVector|Display Window Label Vector|SH|1-n||
00182010|NominalScannedPixelSpacing|Nominal Scanned Pixel Spacing|DS|2||
00182020|DigitizingDeviceTransportDirection|Digitizing Device Transport Direction|CS|1||
00182030|RotationOfScannedFilm|Rotation of Scanned Film|DS|1||
00182041|BiopsyTargetSequence|Biopsy Target Sequence|SQ|1||
00182042|TargetUID|Target UID|UI|1||
00182043|LocalizingCursorPosition|Localizing Cursor Position|FL|2||
00182044|CalculatedTargetPosition|Calculated Target Position|FL|3||
00182045|TargetLabel|Target Label|SH|1||
00182046|DisplayedZValue|Displayed Z Value|FL|1||
00183100|IVUSAcquisition|IVUS Acquisition|CS|1||
00183101|IVUSPullbackRate|IVUS Pullback Rate|DS|1||
00183102|IVUSGatedRate|IVUS Gated Rate|DS|1||
00183103|IVUSPullbackStartFrameNumber|IVUS Pullback Start Frame Number|IS|1||
00183104|IVUSPullbackStopFrameNumber|IVUS Pullback Stop Frame Number|IS|1||
00183105|LesionNumber|Lesion Number|IS|1-n||
00184000|AcquisitionComments|Acquisition Comments|LT|1|R|
00185000|OutputPower|Output Power|SH|1-n||
00185010|TransducerData|Transducer Data|LO|1-n||
00185011|TransducerIdentificationSequence|Transducer Identification Sequence|SQ|1||
00185012|FocusDepth|Focus Depth|DS|1||
00185020|ProcessingFunction|Processing Function|LO|1||
00185021|PostprocessingFunction|Postprocessing Function|LO|1|R|
00185022|MechanicalIndex|Mechanical Index|DS|1||
00185024|BoneThermalIndex|Bone Thermal Index|DS|1||
00185026|CranialThermalIndex|Cranial Thermal Index|DS|1||
00185027|SoftTissueThermalIndex|Soft Tissue Thermal Index|DS|1||
00185028|SoftTissueFocusThermalIndex|Soft Tissue-focus Thermal Index|DS|1||
00185029|SoftTissueSurfaceThermalIndex|Soft Tissue-surface Thermal Index|DS|1||
00185030|DynamicRange|Dynamic Range|DS|1|R|
00185040|TotalGain|Total Gain|DS|1|R|
00185050|DepthOfScanField|Depth of Scan Field|IS|1||
00185100|PatientPosition|Patient Position|CS|1||
00185101|ViewPosition|View Position|CS|1||
00185104|ProjectionEponymousNameCodeSequence|Projection Eponymous Name Code Sequence|SQ|1||
00185210|ImageTransformationMatrix|Image Transformation Matrix|DS|6|R|
00185212|ImageTranslationVector|Image Translation Vector|DS|3|R|
00186000|Sensitivity|Sensitivity|DS|1||
00186011|SequenceOfUltrasoundRegions|Sequence of Ultrasound Regions|SQ|1||
00186012|RegionSpatialFormat|Region Spatial Format|US|1||
00186014|RegionDataType|Region Data Type|US|1||
00186016|RegionFlags|Region Flags|UL|1||
00186018|RegionLocationMinX0|Region Location Min X0|UL|1||
0018601A|RegionLocationMinY0|Region Location Min Y0|UL|1||
0018601C|RegionLocationMaxX1|Region Location Max X1|UL|1||
0018601E|RegionLocationMaxY1|Region Location Max Y1|UL|1||
00186020|ReferencePixelX0|Reference Pixel X0|SL|1||
00186022|ReferencePixelY0|Reference Pixel Y0|SL|1||
00186024|PhysicalUnitsXDirection|Physical Units X Direction|US|1||
00186026|PhysicalUnitsYDirection|Physical Units Y Direction|US|1||
00186028|ReferencePixelPhysicalValueX|Reference Pixel Physical Value X|FD|1||
0018602A|ReferencePixelPhysicalValueY|Reference Pixel Physical Value Y|FD|1||
0018602C|PhysicalDeltaX|Physical Delta X|FD|1||
0018602E|PhysicalDeltaY|Physical Delta Y|FD|1||
00186030|TransducerFrequency|Transducer Frequency|UL|1||
00186031|TransducerType|Transducer Type|CS|1||
00186032|PulseRepetitionFrequency|Pulse Repetition Frequency|UL|1||
00186034|DopplerCorrectionAngle|Doppler Correction Angle|FD|1||
00186036|SteeringAngle|Steering Angle|FD|1||
00186038|DopplerSampleVolumeXPositionRetired|Doppler Sample Volume X Position (Retired)|UL|1|R|
00186039|DopplerSampleVolumeXPosition|Doppler Sample Volume X Position|SL|1||
0018603A|DopplerSampleVolumeYPositionRetired|Doppler Sample Volume Y Position (Retired)|UL|1|R|
0018603B|DopplerSampleVolumeYPosition|Doppler Sample Volume Y Position|SL|1||
0018603C|TMLinePositionX0Retired|TM-Line Position X0 (Retired)|UL|1|R|
0018603D|TMLinePositionX0|TM-Line Position X0|SL|1||
0018603E|TMLinePositionY0Retired|TM-Line Position Y0 (Retired)|UL|1|R|
0018603F|TMLinePositionY0|TM-Line Position Y0|SL|1||
00186040|TMLinePositionX1Retired|TM-Line Position X1 (Retired)|UL|1|R|
00186041|TMLinePositionX1|TM-Line Position X1|SL|1||
00186042|TMLinePositionY1Retired|TM-Line Position Y1 (Retired)|UL|1|R|
00186043|TMLinePositionY1|TM-Line Position Y1|SL|1||
00186044|PixelComponentOrganization|Pixel Component Organization|US|1||
00186046|PixelComponentMask|Pixel Component Mask|UL|1||
00186048|PixelComponentRangeStart|Pixel Component Range Start|UL|1||
0018604A|PixelComponentRangeStop|Pixel Component Range Stop|UL|1||
0018604C|PixelComponentPhysicalUnits|Pixel Component Physical Units|US|1||
0018604E|PixelComponentDataType|Pixel Component Data Type|US|1||
00186050|NumberOfTableBreakPoints|Number of Table Break Points|UL|1||
00186052|TableOfXBreakPoints|Table of X Break Points|UL|1-n||
00186054|TableOfYBreakPoints|Table of Y Break Points|FD|1-n||
00186056|NumberOfTableEntries|Number of Table Entries|UL|1||
00186058|TableOfPixelValues|Table of Pixel Values|UL|1-n||
0018605A|TableOfParameterValues|Table of Parameter Values|FL|1-n||
00186060|RWaveTimeVector|R Wave Time Vector|FL|1-n||
00186070|ActiveImageAreaOverlayGroup|Active Image Area Overlay Group|US|1||
00187000|DetectorConditionsNominalFlag|Detector Conditions Nominal Flag|CS|1||
00187001|DetectorTemperature|Detector Temperature|DS|1||
00187004|DetectorType|Detector Type|CS|1||
00187005|DetectorConfiguration|Detector Configuration|CS|1||
00187006|DetectorDescription|Detector Description|LT|1||
00187008|DetectorMode|Detector Mode|LT|1||
0018700A|DetectorID|Detector ID|SH|1||
0018700C|DateOfLastDetectorCalibration|Date of Last Detector Calibration|DA|1||
0018700E|TimeOfLastDetectorCalibration|Time of Last Detector Calibration|TM|1||
00187010|ExposuresOnDetectorSinceLastCalibration|Exposures on Detector Since Last Calibration|IS|1||
00187011|ExposuresOnDetectorSinceManufactured|Exposures on Detector Since Manufactured|IS|1||
00187012|DetectorTimeSinceLastExposure|Detector Time Since Last Exposure|DS|1||
00187014|DetectorActiveTime|Detector Active Time|DS|1||
00187016|DetectorActivationOffsetFromExposure|Detector Activation Offset From Exposure|DS|1||
0018701A|DetectorBinning|Detector Binning|DS|2||
00187020|DetectorElementPhysicalSize|Detector Element Physical Size|DS|2||
00187022|DetectorElementSpacing|Detector Element Spacing|DS|2||
00187024|DetectorActiveShape|Detector Active Shape|CS|1||
00187026|DetectorActiveDimensions|Detector Active Dimension(s)|DS|1-2||
00187028|DetectorActiveOrigin|Detector Active Origin|DS|2||
0018702A|DetectorManufacturerName|Detector Manufacturer Name|LO|1||
0018702B|DetectorManufacturerModelName|Detector Manufacturer's Model Name|LO|1||
00187030|FieldOfViewOrigin|Field of View Origin|DS|2||
00187032|FieldOfViewRotation|Field of View Rotation|DS|1||
00187034|FieldOfViewHorizontalFlip|Field of View Horizontal Flip|CS|1||
00187036|PixelDataAreaOriginRelativeToFOV|Pixel Data Area Origin Relative To FOV|FL|2||
00187038|PixelDataAreaRotationAngleRelativeToFOV|Pixel Data Area Rotation Angle Relative To FOV|FL|1||
00187040|GridAbsorbingMaterial|Grid Absorbing Material|LT|1||
00187041|GridSpacingMaterial|Grid Spacing Material|LT|1||
00187042|GridThickness|Grid Thickness|DS|1||
00187044|GridPitch|Grid Pitch|DS|1||
00187046|GridAspectRatio|Grid Aspect Ratio|IS|2||
00187048|GridPeriod|Grid Period|DS|1||
0018704C|GridFocalDistance|Grid Focal Distance|DS|1||
00187050|FilterMaterial|Filter Material|CS|1-n||
00187052|FilterThicknessMinimum|Filter Thickness Minimum|DS|1-n||
00187054|FilterThicknessMaximum|Filter Thickness Maximum|DS|1-n||
00187056|FilterBeamPathLengthMinimum|Filter Beam Path Length Minimum|FL|1-n||
00187058|FilterBeamPathLengthMaximum|Filter Beam Path Length Maximum|FL|1-n||
00187060|ExposureControlMode|Exposure Control Mode|CS|1||
00187062|ExposureControlModeDescription|Exposure Control Mode Description|LT|1||
00187064|ExposureStatus|Exposure Status|CS|1||
00187065|PhototimerSetting|Phototimer Setting|DS|1||
00188150|ExposureTimeInuS|Exposure Time in µS|DS|1||
00188151|XRayTubeCurrentInuA|X-Ray Tube Current in µA|DS|1||
00189004|ContentQualification|Content Qualification|CS|1||
00189005|PulseSequenceName|Pulse Sequence Name|SH|1||
00189006|MRImagingModifierSequence|MR Imaging Modifier Sequence|SQ|1||
00189008|EchoPulseSequence|Echo Pulse Sequence|CS|1||
00189009|InversionRecovery|Inversion Recovery|CS|1||
00189010|FlowCompensation|Flow Compensation|CS|1||
00189011|MultipleSpinEcho|Multiple Spin Echo|CS|1||
00189012|MultiPlanarExcitation|Multi-planar Excitation|CS|1||
00189014|PhaseContrast|Phase Contrast|CS|1||
00189015|TimeOfFlightContrast|Time of Flight Contrast|CS|1||
00189016|Spoiling|Spoiling|CS|1||
00189017|SteadyStatePulseSequence|Steady State Pulse Sequence|CS|1||
00189018|EchoPlanarPulseSequence|Echo Planar Pulse Sequence|CS|1||
00189019|TagAngleFirstAxis|Tag Angle First Axis|FD|1||
00189020|MagnetizationTransfer|Magnetization Transfer|CS|1||
00189021|T2Preparation|T2 Preparation|CS|1||
00189022|BloodSignalNulling|Blood Signal Nulling|CS|1||
00189024|SaturationRecovery|Saturation Recovery|CS|1||
00189025|SpectrallySelectedSuppression|Spectrally Selected Suppression|CS|1||
00189026|SpectrallySelectedExcitation|Spectrally Selected Excitation|CS|1||
00189027|SpatialPresaturation|Spatial Pre-saturation|CS|1||
00189028|Tagging|Tagging|CS|1||
00189029|OversamplingPhase|Oversampling Phase|CS|1||
00189030|TagSpacingFirstDimension|Tag Spacing First Dimension|FD|1||
00189032|GeometryOfKSpaceTraversal|Geometry of k-Space Traversal|CS|1||
00189033|SegmentedKSpaceTraversal|Segmented k-Space Traversal|CS|1||
00189034|RectilinearPhaseEncodeReordering|Rectilinear Phase Encode Reordering|CS|1||
00189035|TagThickness|Tag Thickness|FD|1||
00189036|PartialFourierDirection|Partial Fourier Direction|CS|1||
00189037|CardiacSynchronizationTechnique|Cardiac Synchronization Technique|CS|1||
00189041|ReceiveCoilManufacturerName|Receive Coil Manufacturer Name|LO|1||
00189042|MRReceiveCoilSequence|MR Receive Coil Sequence|SQ|1||
00189043|ReceiveCoilType|Receive Coil Type|CS|1||
00189044|QuadratureReceiveCoil|Quadrature Receive Coil|CS|1||
00189045|MultiCoilDefinitionSequence|Multi-Coil Definition Sequence|SQ|1||
00189046|MultiCoilConfiguration|Multi-Coil Configuration|LO|1||
00189047|MultiCoilElementName|Multi-Coil Element Name|SH|1||
00189048|MultiCoilElementUsed|Multi-Coil Element Used|CS|1||
00189049|MRTransmitCoilSequence|MR Transmit Coil Sequence|SQ|1||
00189050|TransmitCoilManufacturerName|Transmit Coil Manufacturer Name|LO|1||
00189051|TransmitCoilType|Transmit Coil Type|CS|1||
00189052|SpectralWidth|Spectral Width|FD|1-2||
00189053|ChemicalShiftReference|Chemical Shift Reference|FD|1-2||
00189054|VolumeLocalizationTechnique|Volume Localization Technique|CS|1||
00189058|MRAcquisitionFrequencyEncodingSteps|MR Acquisition Frequency Encoding Steps|US|1||
00189059|Decoupling|De-coupling|CS|1||
00189060|DecoupledNucleus|De-coupled Nucleus|CS|1-2||
00189061|DecouplingFrequency|De-coupling Frequency|FD|1-2||
00189062|DecouplingMethod|De-coupling Method|CS|1||
00189063|DecouplingChemicalShiftReference|De-coupling Chemical Shift Reference|FD|1-2||
00189064|KSpaceFiltering|k-space Filtering|CS|1||
00189065|TimeDomainFiltering|Time Domain Filtering|CS|1-2||
00189066|NumberOfZeroFills|Number of Zero Fills|US|1-2||
00189067|BaselineCorrection|Baseline Correction|CS|1||
00189069|ParallelReductionFactorInPlane|Parallel Reduction Factor In-plane|FD|1||
00189070|CardiacRRIntervalSpecified|Cardiac R-R Interval Specified|FD|1||
00189073|AcquisitionDuration|Acquisition Duration|FD|1||
00189074|FrameAcquisitionDateTime|Frame Acquisition DateTime|DT|1||
00189075|DiffusionDirectionality|Diffusion Directionality|CS|1||
00189076|DiffusionGradientDirectionSequence|Diffusion Gradient Direction Sequence|SQ|1||
00189077|ParallelAcquisition|Parallel Acquisition|CS|1||
00189078|ParallelAcquisitionTechnique|Parallel Acquisition Technique|CS|1||
00189079|InversionTimes|Inversion Times|FD|1-n||
00189080|MetaboliteMapDescription|Metabolite Map Description|ST|1||
00189081|PartialFourier|Partial Fourier|CS|1||
00189082|EffectiveEchoTime|Effective Echo Time|FD|1||
00189083|MetaboliteMapCodeSequence|Metabolite Map Code Sequence|SQ|1||
00189084|ChemicalShiftSequence|Chemical Shift Sequence|SQ|1||
00189085|CardiacSignalSource|Cardiac Signal Source|CS|1||
00189087|DiffusionBValue|Diffusion b-value|FD|1||
00189089|DiffusionGradientOrientation|Diffusion Gradient Orientation|FD|3||
00189090|VelocityEncodingDirection|Velocity Encoding Direction|FD|3||
00189091|VelocityEncodingMinimumValue|Velocity Encoding Minimum Value|FD|1||
00189092|VelocityEncodingAcquisitionSequence|Velocity Encoding Acquisition Sequence|SQ|1||
00189093|NumberOfKSpaceTrajectories|Number of k-Space Trajectories|US|1||
00189094|CoverageOfKSpace|Coverage of k-Space|CS|1||
00189095|SpectroscopyAcquisitionPhaseRows|Spectroscopy Acquisition Phase Rows|UL|1||
00189096|ParallelReductionFactorInPlaneRetired|Parallel Reduction Factor In-plane (Retired)|FD|1|R|
00189098|TransmitterFrequency|Transmitter Frequency|FD|1-2||
00189100|ResonantNucleus|Resonant Nucleus|CS|1-2||
00189101|FrequencyCorrection|Frequency Correction|CS|1||
00189103|MRSpectroscopyFOVGeometrySequence|MR Spectroscopy FOV/Geometry Sequence|SQ|1||
00189104|SlabThickness|Slab Thickness|FD|1||
00189105|SlabOrientation|Slab Orientation|FD|3||
00189106|MidSlabPosition|Mid Slab Position|FD|3||
00189107|MRSpatialSaturationSequence|MR Spatial Saturation Sequence|SQ|1||
00189112|MRTimingAndRelatedParametersSequence|MR Timing and Related Parameters Sequence|SQ|1||
00189114|MREchoSequence|MR Echo Sequence|SQ|1||
00189115|MRModifierSequence|MR Modifier Sequence|SQ|1||
00189117|MRDiffusionSequence|MR Diffusion Sequence|SQ|1||
00189118|CardiacSynchronizationSequence|Cardiac Synchronization Sequence|SQ|1||
00189119|MRAveragesSequence|MR Averages Sequence|SQ|1||
00189125|MRFOVGeometrySequence|MR FOV/Geometry Sequence|SQ|1||
00189126|VolumeLocalizationSequence|Volume Localization Sequence|SQ|1||
00189127|SpectroscopyAcquisitionDataColumns|Spectroscopy Acquisition Data Columns|UL|1||
00189147|DiffusionAnisotropyType|Diffusion Anisotropy Type|CS|1||
00189151|FrameReferenceDateTime|Frame Reference DateTime|DT|1||
00189152|MRMetaboliteMapSequence|MR Metabolite Map Sequence|SQ|1||
00189155|ParallelReductionFactorOutOfPlane|Parallel Reduction Factor out-of-plane|FD|1||
00189159|SpectroscopyAcquisitionOutOfPlanePhaseSteps|Spectroscopy Acquisition Out-of-plane Phase Steps|UL|1||
00189166|BulkMotionStatus|Bulk Motion Status|CS|1|R|
00189168|ParallelReductionFactorSecondInPlane|Parallel Reduction Factor Second In-plane|FD|1||
00189169|CardiacBeatRejectionTechnique|Cardiac Beat Rejection Technique|CS|1||
00189170|RespiratoryMotionCompensationTechnique|Respiratory Motion Compensation Technique|CS|1||
00189171|RespiratorySignalSource|Respiratory Signal Source|CS|1||
00189172|BulkMotionCompensationTechnique|Bulk Motion Compensation Technique|CS|1||
00189173|BulkMotionSignalSource|Bulk Motion Signal Source|CS|1||
00189174|ApplicableSafetyStandardAgency|Applicable Safety Standard Agency|CS|1||
00189175|ApplicableSafetyStandardDescription|Applicable Safety Standard Description|LO|1||
00189176|OperatingModeSequence|Operating Mode Sequence|SQ|1||
00189177|OperatingModeType|Operating Mode Type|CS|1||
00189178|OperatingMode|Operating Mode|CS|1||
00189179|SpecificAbsorptionRateDefinition|Specific Absorption Rate Definition|CS|1||
00189180|GradientOutputType|Gradient Output Type|CS|1||
00189181|SpecificAbsorptionRateValue|Specific Absorption Rate Value|FD|1||
00189182|GradientOutput|Gradient Output|FD|1||
00189183|FlowCompensationDirection|Flow Compensation Direction|CS|1||
00189184|TaggingDelay|Tagging Delay|FD|1||
00189185|RespiratoryMotionCompensationTechniqueDescription|Respiratory Motion Compensation Technique Description|ST|1||
00189186|RespiratorySignalSourceID|Respiratory Signal Source ID|SH|1||
00189195|ChemicalShiftMinimumIntegrationLimitInHz|Chemical Shift Minimum Integration Limit in Hz|FD|1|R|
00189196|ChemicalShiftMaximumIntegrationLimitInHz|Chemical Shift Maximum Integration Limit in Hz|FD|1|R|
00189197|MRVelocityEncodingSequence|MR Velocity Encoding Sequence|SQ|1||
00189198|FirstOrderPhaseCorrection|First Order Phase Correction|CS|1||
00189199|WaterReferencedPhaseCorrection|Water Referenced Phase Correction|CS|1||
00189200|MRSpectroscopyAcquisitionType|MR Spectroscopy Acquisition Type|CS|1||
00189214|RespiratoryCyclePosition|Respiratory Cycle Position|CS|1||
00189217|VelocityEncodingMaximumValue|Velocity Encoding Maximum Value|FD|1||
00189218|TagSpacingSecondDimension|Tag Spacing Second Dimension|FD|1||
00189219|TagAngleSecondAxis|Tag Angle Second Axis|SS|1||
00189220|FrameAcquisitionDuration|Frame Acquisition Duration|FD|1||
00189226|MRImageFrameTypeSequence|MR Image Frame Type Sequence|SQ|1||
00189227|MRSpectroscopyFrameTypeSequence|MR Spectroscopy Frame Type Sequence|SQ|1||
00189231|MRAcquisitionPhaseEncodingStepsInPlane|MR Acquisition Phase Encoding Steps in-plane|US|1||
00189232|MRAcquisitionPhaseEncodingStepsOutOfPlane|MR Acquisition Phase Encoding Steps out-of-plane|US|1||
00189234|SpectroscopyAcquisitionPhaseColumns|Spectroscopy Acquisition Phase Columns|UL|1||
00189236|CardiacCyclePosition|Cardiac Cycle Position|CS|1||
00189239|SpecificAbsorptionRateSequence|Specific Absorption Rate Sequence|SQ|1||
00189240|RFEchoTrainLength|RF Echo Train Length|US|1||
00189241|GradientEchoTrainLength|Gradient Echo Train Length|US|1||
00189250|ArterialSpinLabelingContrast|Arterial Spin Labeling Contrast|CS|1||
00189251|MRArterialSpinLabelingSequence|MR Arterial Spin Labeling Sequence|SQ|1||
00189252|ASLTechniqueDescription|ASL Technique Description|LO|1||
00189253|ASLSlabNumber|ASL Slab Number|US|1||
00189254|ASLSlabThickness|ASL Slab Thickness|FD|1||
00189255|ASLSlabOrientation|ASL Slab Orientation|FD|3||
00189256|ASLMidSlabPosition|ASL Mid Slab Position|FD|3||
00189257|ASLContext|ASL Context|CS|1||
00189258|ASLPulseTrainDuration|ASL Pulse Train Duration|UL|1||
00189259|ASLCrusherFlag|ASL Crusher Flag|CS|1||
0018925A|ASLCrusherFlowLimit|ASL Crusher Flow Limit|FD|1||
0018925B|ASLCrusherDescription|ASL Crusher Description|LO|1||
0018925C|ASLBolusCutoffFlag|ASL Bolus Cut-off Flag|CS|1||
0018925D|ASLBolusCutoffTimingSequence|ASL Bolus Cut-off Timing Sequence|SQ|1||
0018925E|ASLBolusCutoffTechnique|ASL Bolus Cut-off Technique|LO|1||
0018925F|ASLBolusCutoffDelayTime|ASL Bolus Cut-off Delay Time|UL|1||
00189260|ASLSlabSequence|ASL Slab Sequence|SQ|1||
00189295|ChemicalShiftMinimumIntegrationLimitInppm|Chemical Shift Minimum Integration Limit in ppm|FD|1||
00189296|ChemicalShiftMaximumIntegrationLimitInppm|Chemical Shift Maximum Integration Limit in ppm|FD|1||
00189297|WaterReferenceAcquisition|Water Reference Acquisition|CS|1||
00189298|EchoPeakPosition|Echo Peak Position|IS|1||
00189301|CTAcquisitionTypeSequence|CT Acquisition Type Sequence|SQ|1||
00189302|AcquisitionType|Acquisition Type|CS|1||
00189303|TubeAngle|Tube Angle|FD|1||
00189304|CTAcquisitionDetailsSequence|CT Acquisition Details Sequence|SQ|1||
00189305|RevolutionTime|Revolution Time|FD|1||
00189306|SingleCollimationWidth|Single Collimation Width|FD|1||
00189307|TotalCollimationWidth|Total Collimation Width|FD|1||
00189308|CTTableDynamicsSequence|CT Table Dynamics Sequence|SQ|1||
00189309|TableSpeed|Table Speed|FD|1||
00189310|TableFeedPerRotation|Table Feed per Rotation|FD|1||
00189311|SpiralPitchFactor|Spiral Pitch Factor|FD|1||
00189312|CTGeometrySequence|CT Geometry Sequence|SQ|1||
00189313|DataCollectionCenterPatient|Data Collection Center (Patient)|FD|3||
00189314|CTReconstructionSequence|CT Reconstruction Sequence|SQ|1||
00189315|ReconstructionAlgorithm|Reconstruction Algorithm|CS|1||
00189316|ConvolutionKernelGroup|Convolution Kernel Group|CS|1||
00189317|ReconstructionFieldOfView|Reconstruction Field of View|FD|2||
00189318|ReconstructionTargetCenterPatient|Reconstruction Target Center (Patient)|FD|3||
00189319|ReconstructionAngle|Reconstruction Angle|FD|1||
00189320|ImageFilter|Image Filter|SH|1||
00189321|CTExposureSequence|CT Exposure Sequence|SQ|1||
00189322|ReconstructionPixelSpacing|Reconstruction Pixel Spacing|FD|2||
00189323|ExposureModulationType|Exposure Modulation Type|CS|1-n||
00189324|EstimatedDoseSaving|Estimated Dose Saving|FD|1|R|
00189325|CTXRayDetailsSequence|CT X-Ray Details Sequence|SQ|1||
00189326|CTPositionSequence|CT Position Sequence|SQ|1||
00189327|TablePosition|Table Position|FD|1||
00189328|ExposureTimeInms|Exposure Time in ms|FD|1||
00189329|CTImageFrameTypeSequence|CT Image Frame Type Sequence|SQ|1||
00189330|XRayTubeCurrentInmA|X-Ray Tube Current in mA|FD|1||
00189332|ExposureInmAs|Exposure in mAs|FD|1||
00189333|ConstantVolumeFlag|Constant Volume Flag|CS|1||
00189334|FluoroscopyFlag|Fluoroscopy Flag|CS|1||
00189335|DistanceSourceToDataCollectionCenter|Distance Source to Data Collection Center|FD|1||
00189337|ContrastBolusAgentNumber|Contrast/Bolus Agent Number|US|1||
00189338|ContrastBolusIngredientCodeSequence|Contrast/Bolus Ingredient Code Sequence|SQ|1||
00189340|ContrastAdministrationProfileSequence|Contrast Administration Profile Sequence|SQ|1||
00189341|ContrastBolusUsageSequence|Contrast/Bolus Usage Sequence|SQ|1||
00189342|ContrastBolusAgentAdministered|Contrast/Bolus Agent Administered|CS|1||
00189343|ContrastBolusAgentDetected|Contrast/Bolus Agent Detected|CS|1||
00189344|ContrastBolusAgentPhase|Contrast/Bolus Agent Phase|CS|1||
00189345|CTDIvol|CTDIvol|FD|1||
00189346|CTDIPhantomTypeCodeSequence|CTDI Phantom Type Code Sequence|SQ|1||
00189351|CalciumScoringMassFactorPatient|Calcium Scoring Mass Factor Patient|FL|1||
00189352|CalciumScoringMassFactorDevice|Calcium Scoring Mass Factor Device|FL|3||
00189353|EnergyWeightingFactor|Energy Weighting Factor|FL|1||
00189360|CTAdditionalXRaySourceSequence|CT Additional X-Ray Source Sequence|SQ|1||
00189361|MultienergyCTAcquisition|Multi-energy CT Acquisition|CS|1||
00189362|MultienergyCTAcquisitionSequence|Multi-energy CT Acquisition Sequence|SQ|1||
00189363|MultienergyCTProcessingSequence|Multi-energy CT Processing Sequence|SQ|1||
00189364|MultienergyCTCharacteristicsSequence|Multi-energy CT Characteristics Sequence|SQ|1||
00189365|MultienergyCTXRaySourceSequence|Multi-energy CT X-Ray Source Sequence|SQ|1||
00189366|XRaySourceIndex|X-Ray Source Index|US|1||
00189367|XRaySourceID|X-Ray Source ID|UC|1||
00189368|MultienergySourceTechnique|Multi-energy Source Technique|CS|1||
00189369|SourceStartDateTime|Source Start DateTime|DT|1||
0018936A|SourceEndDateTime|Source End DateTime|DT|1||
0018936B|SwitchingPhaseNumber|Switching Phase Number|US|1||
0018936C|SwitchingPhaseNominalDuration|Switching Phase Nominal Duration|DS|1||
0018936D|SwitchingPhaseTransitionDuration|Switching Phase Transition Duration|DS|1||
0018936E|EffectiveBinEnergy|Effective Bin Energy|DS|1||
0018936F|MultienergyCTXRayDetectorSequence|Multi-energy CT X-Ray Detector Sequence|SQ|1||
00189370|XRayDetectorIndex|X-Ray Detector Index|US|1||
00189371|XRayDetectorID|X-Ray Detector ID|UC|1||
00189372|MultienergyDetectorType|Multi-energy Detector Type|CS|1||
00189373|XRayDetectorLabel|X-Ray Detector Label|ST|1||
00189374|NominalMaxEnergy|Nominal Max Energy|DS|1||
00189375|NominalMinEnergy|Nominal Min Energy|DS|1||
00189376|ReferencedXRayDetectorIndex|Referenced X-Ray Detector Index|US|1-n||
00189377|ReferencedXRaySourceIndex|Referenced X-Ray Source Index|US|1-n||
00189378|ReferencedPathIndex|Referenced Path Index|US|1-n||
00189379|MultienergyCTPathSequence|Multi-energy CT Path Sequence|SQ|1||
0018937A|MultienergyCTPathIndex|Multi-energy CT Path Index|US|1||
0018937B|MultienergyAcquisitionDescription|Multi-energy Acquisition Description|UT|1||
0018937C|MonoenergeticEnergyEquivalent|Monoenergetic Energy Equivalent|FD|1||
0018937D|MaterialCodeSequence|Material Code Sequence|SQ|1||
0018937E|DecompositionMethod|Decomposition Method|CS|1||
0018937F|DecompositionDescription|Decomposition Description|UT|1||
00189380|DecompositionAlgorithmIdentificationSequence|Decomposition Algorithm Identification Sequence|SQ|1||
00189381|DecompositionMaterialSequence|Decomposition Material Sequence|SQ|1||
00189382|MaterialAttenuationSequence|Material Attenuation Sequence|SQ|1||
00189383|PhotonEnergy|Photon Energy|DS|1||
00189384|XRayMassAttenuationCoefficient|X-Ray Mass Attenuation Coefficient|DS|1||
00189390|MetalArtifactReductionSequence|Metal Artifact Reduction Sequence|SQ|1||
00189391|MetalArtifactReductionApplied|Metal Artifact Reduction Applied|CS|1||
00189392|MetalArtifactReductionAlgorithmIdentificationSequence|Metal Artifact Reduction Algorithm Identification Sequence|SQ|1||
00189401|ProjectionPixelCalibrationSequence|Projection Pixel Calibration Sequence|SQ|1||
00189402|DistanceSourceToIsocenter|Distance Source to Isocenter|FL|1||
00189403|DistanceObjectToTableTop|Distance Object to Table Top|FL|1||
00189404|ObjectPixelSpacingInCenterOfBeam|Object Pixel Spacing in Center of Beam|FL|2||
00189405|PositionerPositionSequence|Positioner Position Sequence|SQ|1||
00189406|TablePositionSequence|Table Position Sequence|SQ|1||
00189407|CollimatorShapeSequence|Collimator Shape Sequence|SQ|1||
00189410|PlanesInAcquisition|Planes in Acquisition|CS|1||
00189412|XAXRFFrameCharacteristicsSequence|XA/XRF Frame Characteristics Sequence|SQ|1||
00189417|FrameAcquisitionSequence|Frame Acquisition Sequence|SQ|1||
00189420|XRayReceptorType|X-Ray Receptor Type|CS|1||
00189423|AcquisitionProtocolName|Acquisition Protocol Name|LO|1||
00189424|AcquisitionProtocolDescription|Acquisition Protocol Description|LT|1||
00189425|ContrastBolusIngredientOpaque|Contrast/Bolus Ingredient Opaque|CS|1||
00189426|DistanceReceptorPlaneToDetectorHousing|Distance Receptor Plane to Detector Housing|FL|1||
00189427|IntensifierActiveShape|Intensifier Active Shape|CS|1||
00189428|IntensifierActiveDimensions|Intensifier Active Dimension(s)|FL|1-2||
00189429|PhysicalDetectorSize|Physical Detector Size|FL|2||
00189430|PositionOfIsocenterProjection|Position of Isocenter Projection|FL|2||
00189432|FieldOfViewSequence|Field of View Sequence|SQ|1||
00189433|FieldOfViewDescription|Field of View Description|LO|1||
00189434|ExposureControlSensingRegionsSequence|Exposure Control Sensing Regions Sequence|SQ|1||
00189435|ExposureControlSensingRegionShape|Exposure Control Sensing Region Shape|CS|1||
00189436|ExposureControlSensingRegionLeftVerticalEdge|Exposure Control Sensing Region Left Vertical Edge|SS|1||
00189437|ExposureControlSensingRegionRightVerticalEdge|Exposure Control Sensing Region Right Vertical Edge|SS|1||
00189438|ExposureControlSensingRegionUpperHorizontalEdge|Exposure Control Sensing Region Upper Horizontal Edge|SS|1||
00189439|ExposureControlSensingRegionLowerHorizontalEdge|Exposure Control Sensing Region Lower Horizontal Edge|SS|1||
00189440|CenterOfCircularExposureControlSensingRegion|Center of Circular Exposure Control Sensing Region|SS|2||
00189441|RadiusOfCircularExposureControlSensingRegion|Radius of Circular Exposure Control Sensing Region|US|1||
00189442|VerticesOfThePolygonalExposureControlSensingRegion|Vertices of the Polygonal Exposure Control Sensing Region|SS|2-n||
00189445|||||R|
00189447|ColumnAngulationPatient|Column Angulation (Patient)|FL|1||
00189449|BeamAngle|Beam Angle|FL|1||
00189451|FrameDetectorParametersSequence|Frame Detector Parameters Sequence|SQ|1||
00189452|CalculatedAnatomyThickness|Calculated Anatomy Thickness|FL|1||
00189455|CalibrationSequence|Calibration Sequence|SQ|1||
00189456|ObjectThicknessSequence|Object Thickness Sequence|SQ|1||
00189457|PlaneIdentification|Plane Identification|CS|1||
00189461|FieldOfViewDimensionsInFloat|Field of View Dimension(s) in Float|FL|1-2||
00189462|IsocenterReferenceSystemSequence|Isocenter Reference System Sequence|SQ|1||
00189463|PositionerIsocenterPrimaryAngle|Positioner Isocenter Primary Angle|FL|1||
00189464|PositionerIsocenterSecondaryAngle|Positioner Isocenter Secondary Angle|FL|1||
00189465|PositionerIsocenterDetectorRotationAngle|Positioner Isocenter Detector Rotation Angle|FL|1||
00189466|TableXPositionToIsocenter|Table X Position to Isocenter|FL|1||
00189467|TableYPositionToIsocenter|Table Y Position to Isocenter|FL|1||
00189468|TableZPositionToIsocenter|Table Z Position to Isocenter|FL|1||
00189469|TableHorizontalRotationAngle|Table Horizontal Rotation Angle|FL|1||
00189470|TableHeadTiltAngle|Table Head Tilt Angle|FL|1||
00189471|TableCradleTiltAngle|Table Cradle Tilt Angle|FL|1||
00189472|FrameDisplayShutterSequence|Frame Display Shutter Sequence|SQ|1||
00189473|AcquiredImageAreaDoseProduct|Acquired Image Area Dose Product|FL|1||
00189474|CArmPositionerTabletopRelationship|C-arm Positioner Tabletop Relationship|CS|1||
00189476|XRayGeometrySequence|X-Ray Geometry Sequence|SQ|1||
00189477|IrradiationEventIdentificationSequence|Irradiation Event Identification Sequence|SQ|1||
00189504|XRay3DFrameTypeSequence|X-Ray 3D Frame Type Sequence|SQ|1||
00189506|ContributingSourcesSequence|Contributing Sources Sequence|SQ|1||
00189507|XRay3DAcquisitionSequence|X-Ray 3D Acquisition Sequence|SQ|1||
00189508|PrimaryPositionerScanArc|Primary Positioner Scan Arc|FL|1||
00189509|SecondaryPositionerScanArc|Secondary Positioner Scan Arc|FL|1||
00189510|PrimaryPositionerScanStartAngle|Primary Positioner Scan Start Angle|FL|1||
00189511|SecondaryPositionerScanStartAngle|Secondary Positioner Scan Start Angle|FL|1||
00189514|PrimaryPositionerIncrement|Primary Positioner Increment|FL|1||
00189515|SecondaryPositionerIncrement|Secondary Positioner Increment|FL|1||
00189516|StartAcquisitionDateTime|Start Acquisition DateTime|DT|1||
00189517|EndAcquisitionDateTime|End Acquisition DateTime|DT|1||
00189518|PrimaryPositionerIncrementSign|Primary Positioner Increment Sign|SS|1||
00189519|SecondaryPositionerIncrementSign|Secondary Positioner Increment Sign|SS|1||
00189524|ApplicationName|Application Name|LO|1||
00189525|ApplicationVersion|Application Version|LO|1||
00189526|ApplicationManufacturer|Application Manufacturer|LO|1||
00189527|AlgorithmType|Algorithm Type|CS|1||
00189528|AlgorithmDescription|Algorithm Description|LO|1||
00189530|XRay3DReconstructionSequence|X-Ray 3D Reconstruction Sequence|SQ|1||
00189531|ReconstructionDescription|Reconstruction Description|LO|1||
00189538|PerProjectionAcquisitionSequence|Per Projection Acquisition Sequence|SQ|1||
00189541|DetectorPositionSequence|Detector Position Sequence|SQ|1||
00189542|XRayAcquisitionDoseSequence|X-Ray Acquisition Dose Sequence|SQ|1||
00189543|XRaySourceIsocenterPrimaryAngle|X-Ray Source Isocenter Primary Angle|FD|1||
00189544|XRaySourceIsocenterSecondaryAngle|X-Ray Source Isocenter Secondary Angle|FD|1||
00189545|BreastSupportIsocenterPrimaryAngle|Breast Support Isocenter Primary Angle|FD|1||
00189546|BreastSupportIsocenterSecondaryAngle|Breast Support Isocenter Secondary Angle|FD|1||
00189547|BreastSupportXPositionToIsocenter|Breast Support X Position to Isocenter|FD|1||
00189548|BreastSupportYPositionToIsocenter|Breast Support Y Position to Isocenter|FD|1||
00189549|BreastSupportZPositionToIsocenter|Breast Support Z Position to Isocenter|FD|1||
00189550|DetectorIsocenterPrimaryAngle|Detector Isocenter Primary Angle|FD|1||
00189551|DetectorIsocenterSecondaryAngle|Detector Isocenter Secondary Angle|FD|1||
00189552|DetectorXPositionToIsocenter|Detector X Position to Isocenter|FD|1||
00189553|DetectorYPositionToIsocenter|Detector Y Position to Isocenter|FD|1||
00189554|DetectorZPositionToIsocenter|Detector Z Position to Isocenter|FD|1||
00189555|XRayGridSequence|X-Ray Grid Sequence|SQ|1||
00189556|XRayFilterSequence|X-Ray Filter Sequence|SQ|1||
00189557|DetectorActiveAreaTLHCPosition|Detector Active Area TLHC Position|FD|3||
00189558|DetectorActiveAreaOrientation|Detector Active Area Orientation|FD|6||
00189559|PositionerPrimaryAngleDirection|Positioner Primary Angle Direction|CS|1||
00189601|DiffusionBMatrixSequence|Diffusion b-matrix Sequence|SQ|1||
00189602|DiffusionBValueXX|Diffusion b-value XX|FD|1||
00189603|DiffusionBValueXY|Diffusion b-value XY|FD|1||
00189604|DiffusionBValueXZ|Diffusion b-value XZ|FD|1||
00189605|DiffusionBValueYY|Diffusion b-value YY|FD|1||
00189606|DiffusionBValueYZ|Diffusion b-value YZ|FD|1||
00189607|DiffusionBValueZZ|Diffusion b-value ZZ|FD|1||
00189621|FunctionalMRSequence|Functional MR Sequence|SQ|1||
00189622|FunctionalSettlingPhaseFramesPresent|Functional Settling Phase Frames Present|CS|1||
00189623|FunctionalSyncPulse|Functional Sync Pulse|DT|1||
00189624|SettlingPhaseFrame|Settling Phase Frame|CS|1||
00189701|DecayCorrectionDateTime|Decay Correction DateTime|DT|1||
00189715|StartDensityThreshold|Start Density Threshold|FD|1||
00189716|StartRelativeDensityDifferenceThreshold|Start Relative Density Difference Threshold|FD|1||
00189717|StartCardiacTriggerCountThreshold|Start Cardiac Trigger Count Threshold|FD|1||
00189718|StartRespiratoryTriggerCountThreshold|Start Respiratory Trigger Count Threshold|FD|1||
00189719|TerminationCountsThreshold|Termination Counts Threshold|FD|1||
00189720|TerminationDensityThreshold|Termination Density Threshold|FD|1||
00189721|TerminationRelativeDensityThreshold|Termination Relative Density Threshold|FD|1||
00189722|TerminationTimeThreshold|Termination Time Threshold|FD|1||
00189723|TerminationCardiacTriggerCountThreshold|Termination Cardiac Trigger Count Threshold|FD|1||
00189724|TerminationRespiratoryTriggerCountThreshold|Termination Respiratory Trigger Count Threshold|FD|1||
00189725|DetectorGeometry|Detector Geometry|CS|1||
00189726|TransverseDetectorSeparation|Transverse Detector Separation|FD|1||
00189727|AxialDetectorDimension|Axial Detector Dimension|FD|1||
00189729|RadiopharmaceuticalAgentNumber|Radiopharmaceutical Agent Number|US|1||
00189732|PETFrameAcquisitionSequence|PET Frame Acquisition Sequence|SQ|1||
00189733|PETDetectorMotionDetailsSequence|PET Detector Motion Details Sequence|SQ|1||
00189734|PETTableDynamicsSequence|PET Table Dynamics Sequence|SQ|1||
00189735|PETPositionSequence|PET Position Sequence|SQ|1||
00189736|PETFrameCorrectionFactorsSequence|PET Frame Correction Factors Sequence|SQ|1||
00189737|RadiopharmaceuticalUsageSequence|Radiopharmaceutical Usage Sequence|SQ|1||
00189738|AttenuationCorrectionSource|Attenuation Correction Source|CS|1||
00189739|NumberOfIterations|Number of Iterations|US|1||
00189740|NumberOfSubsets|Number of Subsets|US|1||
00189749|PETReconstructionSequence|PET Reconstruction Sequence|SQ|1||
00189751|PETFrameTypeSequence|PET Frame Type Sequence|SQ|1||
00189755|TimeOfFlightInformationUsed|Time of Flight Information Used|CS|1||
00189756|ReconstructionType|Reconstruction Type|CS|1||
00189758|DecayCorrected|Decay Corrected|CS|1||
00189759|AttenuationCorrected|Attenuation Corrected|CS|1||
00189760|ScatterCorrected|Scatter Corrected|CS|1||
00189761|DeadTimeCorrected|Dead Time Corrected|CS|1||
00189762|GantryMotionCorrected|Gantry Motion Corrected|CS|1||
00189763|PatientMotionCorrected|Patient Motion Corrected|CS|1||
00189764|CountLossNormalizationCorrected|Count Loss Normalization Corrected|CS|1||
00189765|RandomsCorrected|Randoms Corrected|CS|1||
00189766|NonUniformRadialSamplingCorrected|Non-uniform Radial Sampling Corrected|CS|1||
00189767|SensitivityCalibrated|Sensitivity Calibrated|CS|1||
00189768|DetectorNormalizationCorrection|Detector Normalization Correction|CS|1||
00189769|IterativeReconstructionMethod|Iterative Reconstruction Method|CS|1||
00189770|AttenuationCorrectionTemporalRelationship|Attenuation Correction Temporal Relationship|CS|1||
00189771|PatientPhysiologicalStateSequence|Patient Physiological State Sequence|SQ|1||
00189772|PatientPhysiologicalStateCodeSequence|Patient Physiological State Code Sequence|SQ|1||
00189801|DepthsOfFocus|Depth(s) of Focus|FD|1-n||
00189803|ExcludedIntervalsSequence|Excluded Intervals Sequence|SQ|1||
00189804|ExclusionStartDateTime|Exclusion Start DateTime|DT|1||
00189805|ExclusionDuration|Exclusion Duration|FD|1||
00189806|USImageDescriptionSequence|US Image Description Sequence|SQ|1||
00189807|ImageDataTypeSequence|Image Data Type Sequence|SQ|1||
00189808|DataType|Data Type|CS|1||
00189809|TransducerScanPatternCodeSequence|Transducer Scan Pattern Code Sequence|SQ|1||
0018980B|AliasedDataType|Aliased Data Type|CS|1||
0018980C|PositionMeasuringDeviceUsed|Position Measuring Device Used|CS|1||
0018980D|TransducerGeometryCodeSequence|Transducer Geometry Code Sequence|SQ|1||
0018980E|TransducerBeamSteeringCodeSequence|Transducer Beam Steering Code Sequence|SQ|1||
0018980F|TransducerApplicationCodeSequence|Transducer Application Code Sequence|SQ|1||
00189810|ZeroVelocityPixelValue|Zero Velocity Pixel Value|US/SS|1||
00189821|PhotoacousticExcitationCharacteristicsSequence|Photoacoustic Excitation Characteristics Sequence|SQ|1||
00189822|ExcitationSpectralWidth|Excitation Spectral Width|FD|1||
00189823|ExcitationEnergy|Excitation Energy|FD|1||
00189824|ExcitationPulseDuration|Excitation Pulse Duration|FD|1||
00189825|ExcitationWavelengthSequence|Excitation Wavelength Sequence|SQ|1||
00189826|ExcitationWavelength|Excitation Wavelength|FD|1||
00189828|IlluminationTranslationFlag|Illumination Translation Flag|CS|1||
00189829|AcousticCouplingMediumFlag|Acoustic Coupling Medium Flag|CS|1||
0018982A|AcousticCouplingMediumCodeSequence|Acoustic Coupling Medium Code Sequence|SQ|1||
0018982B|AcousticCouplingMediumTemperature|Acoustic Coupling Medium Temperature|FD|1||
0018982C|TransducerResponseSequence|Transducer Response Sequence|SQ|1||
0018982D|CenterFrequency|Center Frequency|FD|1||
0018982E|FractionalBandwidth|Fractional Bandwidth|FD|1||
0018982F|LowerCutoffFrequency|Lower Cutoff Frequency|FD|1||
00189830|UpperCutoffFrequency|Upper Cutoff Frequency|FD|1||
00189831|TransducerTechnologySequence|Transducer Technology Sequence|SQ|1||
00189832|SoundSpeedCorrectionMechanismCodeSequence|Sound Speed Correction Mechanism Code Sequence|SQ|1||
00189833|ObjectSoundSpeed|Object Sound Speed|FD|1||
00189834|AcousticCouplingMediumSoundSpeed|Acoustic Coupling Medium Sound Speed|FD|1||
00189835|PhotoacousticImageFrameTypeSequence|Photoacoustic Image Frame Type Sequence|SQ|1||
00189836|ImageDataTypeCodeSequence|Image Data Type Code Sequence|SQ|1||
00189900|ReferenceLocationLabel|Reference Location Label|LO|1||
00189901|ReferenceLocationDescription|Reference Location Description|UT|1||
00189902|ReferenceBasisCodeSequence|Reference Basis Code Sequence|SQ|1||
00189903|ReferenceGeometryCodeSequence|Reference Geometry Code Sequence|SQ|1||
00189904|OffsetDistance|Offset Distance|DS|1||
00189905|OffsetDirection|Offset Direction|CS|1||
00189906|PotentialScheduledProtocolCodeSequence|Potential Scheduled Protocol Code Sequence|SQ|1||
00189907|PotentialRequestedProcedureCodeSequence|Potential Requested Procedure Code Sequence|SQ|1||
00189908|PotentialReasonsForProcedure|Potential Reasons for Procedure|UC|1-n||
00189909|PotentialReasonsForProcedureCodeSequence|Potential Reasons for Procedure Code Sequence|SQ|1||
0018990A|PotentialDiagnosticTasks|Potential Diagnostic Tasks|UC|1-n||
0018990B|ContraindicationsCodeSequence|Contraindications Code Sequence|SQ|1||
0018990C|ReferencedDefinedProtocolSequence|Referenced Defined Protocol Sequence|SQ|1||
0018990D|ReferencedPerformedProtocolSequence|Referenced Performed Protocol Sequence|SQ|1||
0018990E|PredecessorProtocolSequence|Predecessor Protocol Sequence|SQ|1||
0018990F|ProtocolPlanningInformation|Protocol Planning Information|UT|1||
00189910|ProtocolDesignRationale|Protocol Design Rationale|UT|1||
00189911|PatientSpecificationSequence|Patient Specification Sequence|SQ|1||
00189912|ModelSpecificationSequence|Model Specification Sequence|SQ|1||
00189913|ParametersSpecificationSequence|Parameters Specification Sequence|SQ|1||
00189914|InstructionSequence|Instruction Sequence|SQ|1||
00189915|InstructionIndex|Instruction Index|US|1||
00189916|InstructionText|Instruction Text|LO|1||
00189917|InstructionDescription|Instruction Description|UT|1||
00189918|InstructionPerformedFlag|Instruction Performed Flag|CS|1||
00189919|InstructionPerformedDateTime|Instruction Performed DateTime|DT|1||
0018991A|InstructionPerformanceComment|Instruction Performance Comment|UT|1||
0018991B|PatientPositioningInstructionSequence|Patient Positioning Instruction Sequence|SQ|1||
0018991C|PositioningMethodCodeSequence|Positioning Method Code Sequence|SQ|1||
0018991D|PositioningLandmarkSequence|Positioning Landmark Sequence|SQ|1||
0018991E|TargetFrameOfReferenceUID|Target Frame of Reference UID|UI|1||
0018991F|AcquisitionProtocolElementSpecificationSequence|Acquisition Protocol Element Specification Sequence|SQ|1||
00189920|AcquisitionProtocolElementSequence|Acquisition Protocol Element Sequence|SQ|1||
00189921|ProtocolElementNumber|Protocol Element Number|US|1||
00189922|ProtocolElementName|Protocol Element Name|LO|1||
00189923|ProtocolElementCharacteristicsSummary|Protocol Element Characteristics Summary|UT|1||
00189924|ProtocolElementPurpose|Protocol Element Purpose|UT|1||
00189930|AcquisitionMotion|Acquisition Motion|CS|1||
00189931|AcquisitionStartLocationSequence|Acquisition Start Location Sequence|SQ|1||
00189932|AcquisitionEndLocationSequence|Acquisition End Location Sequence|SQ|1||
00189933|ReconstructionProtocolElementSpecificationSequence|Reconstruction Protocol Element Specification Sequence|SQ|1||
00189934|ReconstructionProtocolElementSequence|Reconstruction Protocol Element Sequence|SQ|1||
00189935|StorageProtocolElementSpecificationSequence|Storage Protocol Element Specification Sequence|SQ|1||
00189936|StorageProtocolElementSequence|Storage Protocol Element Sequence|SQ|1||
00189937|RequestedSeriesDescription|Requested Series Description|LO|1||
00189938|SourceAcquisitionProtocolElementNumber|Source Acquisition Protocol Element Number|US|1-n||
00189939|SourceAcquisitionBeamNumber|Source Acquisition Beam Number|US|1-n||
0018993A|SourceReconstructionProtocolElementNumber|Source Reconstruction Protocol Element Number|US|1-n||
0018993B|ReconstructionStartLocationSequence|Reconstruction Start Location Sequence|SQ|1||
0018993C|ReconstructionEndLocationSequence|Reconstruction End Location Sequence|SQ|1||
0018993D|ReconstructionAlgorithmSequence|Reconstruction Algorithm Sequence|SQ|1||
0018993E|ReconstructionTargetCenterLocationSequence|Reconstruction Target Center Location Sequence|SQ|1||
00189941|ImageFilterDescription|Image Filter Description|UT|1||
00189942|CTDIvolNotificationTrigger|CTDIvol Notification Trigger|FD|1||
00189943|DLPNotificationTrigger|DLP Notification Trigger|FD|1||
00189944|AutoKVPSelectionType|Auto KVP Selection Type|CS|1||
00189945|AutoKVPUpperBound|Auto KVP Upper Bound|FD|1||
00189946|AutoKVPLowerBound|Auto KVP Lower Bound|FD|1||
00189947|ProtocolDefinedPatientPosition|Protocol Defined Patient Position|CS|1||
0018A001|ContributingEquipmentSequence|Contributing Equipment Sequence|SQ|1||
0018A002|ContributionDateTime|Contribution DateTime|DT|1||
0018A003|ContributionDescription|Contribution Description|ST|1||
0020000D|StudyInstanceUID|Study Instance UID|UI|1||
0020000E|SeriesInstanceUID|Series Instance UID|UI|1||
00200010|StudyID|Study ID|SH|1||
00200011|SeriesNumber|Series Number|IS|1||
00200012|AcquisitionNumber|Acquisition Number|IS|1||
00200013|InstanceNumber|Instance Number|IS|1||
00200014|IsotopeNumber|Isotope Number|IS|1|R|
00200015|PhaseNumber|Phase Number|IS|1|R|
00200016|IntervalNumber|Interval Number|IS|1|R|
00200017|TimeSlotNumber|Time Slot Number|IS|1|R|
00200018|AngleNumber|Angle Number|IS|1|R|
00200019|ItemNumber|Item Number|IS|1||
00200020|PatientOrientation|Patient Orientation|CS|2||
00200022|OverlayNumber|Overlay Number|IS|1|R|
00200024|CurveNumber|Curve Number|IS|1|R|
00200026|LUTNumber|LUT Number|IS|1|R|
00200027|PyramidLabel|Pyramid Label|LO|1||
00200030|ImagePosition|Image Position|DS|3|R|
00200032|ImagePositionPatient|Image Position (Patient)|DS|3||
00200035|ImageOrientation|Image Orientation|DS|6|R|
00200037|ImageOrientationPatient|Image Orientation (Patient)|DS|6||
00200050|Location|Location|DS|1|R|
00200052|FrameOfReferenceUID|Frame of Reference UID|UI|1||
00200060|Laterality|Laterality|CS|1||
00200062|ImageLaterality|Image Laterality|CS|1||
00200070|ImageGeometryType|Image Geometry Type|LO|1|R|
00200080|MaskingImage|Masking Image|CS|1-n|R|
002000AA|ReportNumber|Report Number|IS|1|R|
00200100|TemporalPositionIdentifier|Temporal Position Identifier|IS|1||
00200105|NumberOfTemporalPositions|Number of Temporal Positions|IS|1||
00200110|TemporalResolution|Temporal Resolution|DS|1||
00200200|SynchronizationFrameOfReferenceUID|Synchronization Frame of Reference UID|UI|1||
00200242|SOPInstanceUIDOfConcatenationSource|SOP Instance UID of Concatenation Source|UI|1||
00201000|SeriesInStudy|Series in Study|IS|1|R|
00201001|AcquisitionsInSeries|Acquisitions in Series|IS|1|R|
00201002|ImagesInAcquisition|Images in Acquisition|IS|1||
00201003|ImagesInSeries|Images in Series|IS|1|R|
00201004|AcquisitionsInStudy|Acquisitions in Study|IS|1|R|
00201005|ImagesInStudy|Images in Study|IS|1|R|
00201020|Reference|Reference|LO|1-n|R|
0020103F|TargetPositionReferenceIndicator|Target Position Reference Indicator|LO|1||
00201040|PositionReferenceIndicator|Position Reference Indicator|LO|1||
00201041|SliceLocation|Slice Location|DS|1||
00201070|OtherStudyNumbers|Other Study Numbers|IS|1-n|R|
00201200|NumberOfPatientRelatedStudies|Number of Patient Related Studies|IS|1||
00201202|NumberOfPatientRelatedSeries|Number of Patient Related Series|IS|1||
00201204|NumberOfPatientRelatedInstances|Number of Patient Related Instances|IS|1||
00201206|NumberOfStudyRelatedSeries|Number of Study Related Series|IS|1||
00201208|NumberOfStudyRelatedInstances|Number of Study Related Instances|IS|1||
00201209|NumberOfSeriesRelatedInstances|Number of Series Related Instances|IS|1||
002031xx|SourceImageIDs|Source Image IDs|CS|1-n|R|x
00203401|ModifyingDeviceID|Modifying Device ID|CS|1|R|
00203402|ModifiedImageID|Modified Image ID|CS|1|R|
00203403|ModifiedImageDate|Modified Image Date|DA|1|R|
00203404|ModifyingDeviceManufacturer|Modifying Device Manufacturer|LO|1|R|
00203405|ModifiedImageTime|Modified Image Time|TM|1|R|
00203406|ModifiedImageDescription|Modified Image Description|LO|1|R|
00204000|ImageComments|Image Comments|LT|1||
00205000|OriginalImageIdentification|Original Image Identification|AT|1-n|R|
00205002|OriginalImageIdentificationNomenclature|Original Image Identification Nomenclature|LO|1-n|R|
00209056|StackID|Stack ID|SH|1||
00209057|InStackPositionNumber|In-Stack Position Number|UL|1||
00209071|FrameAnatomySequence|Frame Anatomy Sequence|SQ|1||
00209072|FrameLaterality|Frame Laterality|CS|1||
00209111|FrameContentSequence|Frame Content Sequence|SQ|1||
00209113|PlanePositionSequence|Plane Position Sequence|SQ|1||
00209116|PlaneOrientationSequence|Plane Orientation Sequence|SQ|1||
00209128|TemporalPositionIndex|Temporal Position Index|UL|1||
00209153|NominalCardiacTriggerDelayTime|Nominal Cardiac Trigger Delay Time|FD|1||
00209154|NominalCardiacTriggerTimePriorToRPeak|Nominal Cardiac Trigger Time Prior To R-Peak|FL|1||
00209155|ActualCardiacTriggerTimePriorToRPeak|Actual Cardiac Trigger Time Prior To R-Peak|FL|1||
00209156|FrameAcquisitionNumber|Frame Acquisition Number|US|1||
00209157|DimensionIndexValues|Dimension Index Values|UL|1-n||
00209158|FrameComments|Frame Comments|LT|1||
00209161|ConcatenationUID|Concatenation UID|UI|1||
00209162|InConcatenationNumber|In-concatenation Number|US|1||
00209163|InConcatenationTotalNumber|In-concatenation Total Number|US|1||
00209164|DimensionOrganizationUID|Dimension Organization UID|UI|1||
00209165|DimensionIndexPointer|Dimension Index Pointer|AT|1||
00209167|FunctionalGroupPointer|Functional Group Pointer|AT|1||
00209170|UnassignedSharedConvertedAttributesSequence|Unassigned Shared Converted Attributes Sequence|SQ|1||
00209171|UnassignedPerFrameConvertedAttributesSequence|Unassigned Per-Frame Converted Attributes Sequence|SQ|1||
00209172|ConversionSourceAttributesSequence|Conversion Source Attributes Sequence|SQ|1||
00209213|DimensionIndexPrivateCreator|Dimension Index Private Creator|LO|1||
00209221|DimensionOrganizationSequence|Dimension Organization Sequence|SQ|1||
00209222|DimensionIndexSequence|Dimension Index Sequence|SQ|1||
00209228|ConcatenationFrameOffsetNumber|Concatenation Frame Offset Number|UL|1||
00209238|FunctionalGroupPrivateCreator|Functional Group Private Creator|LO|1||
00209241|NominalPercentageOfCardiacPhase|Nominal Percentage of Cardiac Phase|FL|1||
00209245|NominalPercentageOfRespiratoryPhase|Nominal Percentage of Respiratory Phase|FL|1||
00209246|StartingRespiratoryAmplitude|Starting Respiratory Amplitude|FL|1||
00209247|StartingRespiratoryPhase|Starting Respiratory Phase|CS|1||
00209248|EndingRespiratoryAmplitude|Ending Respiratory Amplitude|FL|1||
00209249|EndingRespiratoryPhase|Ending Respiratory Phase|CS|1||
00209250|RespiratoryTriggerType|Respiratory Trigger Type|CS|1||
00209251|RRIntervalTimeNominal|R-R Interval Time Nominal|FD|1||
00209252|ActualCardiacTriggerDelayTime|Actual Cardiac Trigger Delay Time|FD|1||
00209253|RespiratorySynchronizationSequence|Respiratory Synchronization Sequence|SQ|1||
00209254|RespiratoryIntervalTime|Respiratory Interval Time|FD|1||
00209255|NominalRespiratoryTriggerDelayTime|Nominal Respiratory Trigger Delay Time|FD|1||
00209256|RespiratoryTriggerDelayThreshold|Respiratory Trigger Delay Threshold|FD|1||
00209257|ActualRespiratoryTriggerDelayTime|Actual Respiratory Trigger Delay Time|FD|1||
00209301|ImagePositionVolume|Image Position (Volume)|FD|3||
00209302|ImageOrientationVolume|Image Orientation (Volume)|FD|6||
00209307|UltrasoundAcquisitionGeometry|Ultrasound Acquisition Geometry|CS|1||
00209308|ApexPosition|Apex Position|FD|3||
00209309|VolumeToTransducerMappingMatrix|Volume to Transducer Mapping Matrix|FD|16||
0020930A|VolumeToTableMappingMatrix|Volume to Table Mapping Matrix|FD|16||
0020930B|VolumeToTransducerRelationship|Volume to Transducer Relationship|CS|1||
0020930C|PatientFrameOfReferenceSource|Patient Frame of Reference Source|CS|1||
0020930D|TemporalPositionTimeOffset|Temporal Position Time Offset|FD|1||
0020930E|PlanePositionVolumeSequence|Plane Position (Volume) Sequence|SQ|1||
0020930F|PlaneOrientationVolumeSequence|Plane Orientation (Volume) Sequence|SQ|1||
00209310|TemporalPositionSequence|Temporal Position Sequence|SQ|1||
00209311|DimensionOrganizationType|Dimension Organization Type|CS|1||
00209312|VolumeFrameOfReferenceUID|Volume Frame of Reference UID|UI|1||
00209313|TableFrameOfReferenceUID|Table Frame of Reference UID|UI|1||
00209421|DimensionDescriptionLabel|Dimension Description Label|LO|1||
00209450|PatientOrientationInFrameSequence|Patient Orientation in Frame Sequence|SQ|1||
00209453|FrameLabel|Frame Label|LO|1||
00209518|AcquisitionIndex|Acquisition Index|US|1-n||
00209529|ContributingSOPInstancesReferenceSequence|Contributing SOP Instances Reference Sequence|SQ|1||
00209536|ReconstructionIndex|Reconstruction Index|US|1||
00220001|LightPathFilterPassThroughWavelength|Light Path Filter Pass-Through Wavelength|US|1||
00220002|LightPathFilterPassBand|Light Path Filter Pass Band|US|2||
00220003|ImagePathFilterPassThroughWavelength|Image Path Filter Pass-Through Wavelength|US|1||
00220004|ImagePathFilterPassBand|Image Path Filter Pass Band|US|2||
00220005|PatientEyeMovementCommanded|Patient Eye Movement Commanded|CS|1||
00220006|PatientEyeMovementCommandCodeSequence|Patient Eye Movement Command Code Sequence|SQ|1||
00220007|SphericalLensPower|Spherical Lens Power|FL|1||
00220008|CylinderLensPower|Cylinder Lens Power|FL|1||
00220009|CylinderAxis|Cylinder Axis|FL|1||
0022000A|EmmetropicMagnification|Emmetropic Magnification|FL|1||
0022000B|IntraOcularPressure|Intra Ocular Pressure|FL|1||
0022000C|HorizontalFieldOfView|Horizontal Field of View|FL|1||
0022000D|PupilDilated|Pupil Dilated|CS|1||
0022000E|DegreeOfDilation|Degree of Dilation|FL|1||
0022000F|VertexDistance|Vertex Distance|FD|1||
00220010|StereoBaselineAngle|Stereo Baseline Angle|FL|1||
00220011|StereoBaselineDisplacement|Stereo Baseline Displacement|FL|1||
00220012|StereoHorizontalPixelOffset|Stereo Horizontal Pixel Offset|FL|1||
00220013|StereoVerticalPixelOffset|Stereo Vertical Pixel Offset|FL|1||
00220014|StereoRotation|Stereo Rotation|FL|1||
00220015|AcquisitionDeviceTypeCodeSequence|Acquisition Device Type Code Sequence|SQ|1||
00220016|IlluminationTypeCodeSequence|Illumination Type Code Sequence|SQ|1||
00220017|LightPathFilterTypeStackCodeSequence|Light Path Filter Type Stack Code Sequence|SQ|1||
00220018|ImagePathFilterTypeStackCodeSequence|Image Path Filter Type Stack Code Sequence|SQ|1||
00220019|LensesCodeSequence|Lenses Code Sequence|SQ|1||
0022001A|ChannelDescriptionCodeSequence|Channel Description Code Sequence|SQ|1||
0022001B|RefractiveStateSequence|Refractive State Sequence|SQ|1||
0022001C|MydriaticAgentCodeSequence|Mydriatic Agent Code Sequence|SQ|1||
0022001D|RelativeImagePositionCodeSequence|Relative Image Position Code Sequence|SQ|1||
0022001E|CameraAngleOfView|Camera Angle of View|FL|1||
00220020|StereoPairsSequence|Stereo Pairs Sequence|SQ|1||
00220021|LeftImageSequence|Left Image Sequence|SQ|1||
00220022|RightImageSequence|Right Image Sequence|SQ|1||
00220028|StereoPairsPresent|Stereo Pairs Present|CS|1||
00220030|AxialLengthOfTheEye|Axial Length of the Eye|FL|1||
00220031|OphthalmicFrameLocationSequence|Ophthalmic Frame Location Sequence|SQ|1||
00220032|ReferenceCoordinates|Reference Coordinates|FL|2-2n||
00220035|DepthSpatialResolution|Depth Spatial Resolution|FL|1||
00220036|MaximumDepthDistortion|Maximum Depth Distortion|FL|1||
00220037|AlongScanSpatialResolution|Along-scan Spatial Resolution|FL|1||
00220038|MaximumAlongScanDistortion|Maximum Along-scan Distortion|FL|1||
00220039|OphthalmicImageOrientation|Ophthalmic Image Orientation|CS|1||
00220041|DepthOfTransverseImage|Depth of Transverse Image|FL|1||
00220042|MydriaticAgentConcentrationUnitsSequence|Mydriatic Agent Concentration Units Sequence|SQ|1||
00220048|AcrossScanSpatialResolution|Across-scan Spatial Resolution|FL|1||
00220049|MaximumAcrossScanDistortion|Maximum Across-scan Distortion|FL|1||
0022004E|MydriaticAgentConcentration|Mydriatic Agent Concentration|DS|1||
00220055|IlluminationWaveLength|Illumination Wave Length|FL|1||
00220056|IlluminationPower|Illumination Power|FL|1||
00220057|IlluminationBandwidth|Illumination Bandwidth|FL|1||
00220058|MydriaticAgentSequence|Mydriatic Agent Sequence|SQ|1||
00221007|OphthalmicAxialMeasurementsRightEyeSequence|Ophthalmic Axial Measurements Right Eye Sequence|SQ|1||
00221008|OphthalmicAxialMeasurementsLeftEyeSequence|Ophthalmic Axial Measurements Left Eye Sequence|SQ|1||
00221009|OphthalmicAxialMeasurementsDeviceType|Ophthalmic Axial Measurements Device Type|CS|1||
00221010|OphthalmicAxialLengthMeasurementsType|Ophthalmic Axial Length Measurements Type|CS|1||
00221012|OphthalmicAxialLengthSequence|Ophthalmic Axial Length Sequence|SQ|1||
00221019|OphthalmicAxialLength|Ophthalmic Axial Length|FL|1||
00221024|LensStatusCodeSequence|Lens Status Code Sequence|SQ|1||
00221025|VitreousStatusCodeSequence|Vitreous Status Code Sequence|SQ|1||
00221028|IOLFormulaCodeSequence|IOL Formula Code Sequence|SQ|1||
00221029|IOLFormulaDetail|IOL Formula Detail|LO|1||
00221033|KeratometerIndex|Keratometer Index|FL|1||
00221035|SourceOfOphthalmicAxialLengthCodeSequence|Source of Ophthalmic Axial Length Code Sequence|SQ|1||
00221036|SourceOfCornealSizeDataCodeSequence|Source of Corneal Size Data Code Sequence|SQ|1||
00221037|TargetRefraction|Target Refraction|FL|1||
00221039|RefractiveProcedureOccurred|Refractive Procedure Occurred|CS|1||
00221040|RefractiveSurgeryTypeCodeSequence|Refractive Surgery Type Code Sequence|SQ|1||
00221044|OphthalmicUltrasoundMethodCodeSequence|Ophthalmic Ultrasound Method Code Sequence|SQ|1||
00221045|SurgicallyInducedAstigmatismSequence|Surgically Induced Astigmatism Sequence|SQ|1||
00221046|TypeOfOpticalCorrection|Type of Optical Correction|CS|1||
00221047|ToricIOLPowerSequence|Toric IOL Power Sequence|SQ|1||
00221048|PredictedToricErrorSequence|Predicted Toric Error Sequence|SQ|1||
00221049|PreSelectedForImplantation|Pre-Selected for Implantation|CS|1||
0022104A|ToricIOLPowerForExactEmmetropiaSequence|Toric IOL Power for Exact Emmetropia Sequence|SQ|1||
0022104B|ToricIOLPowerForExactTargetRefractionSequence|Toric IOL Power for Exact Target Refraction Sequence|SQ|1||
00221050|OphthalmicAxialLengthMeasurementsSequence|Ophthalmic Axial Length Measurements Sequence|SQ|1||
00221053|IOLPower|IOL Power|FL|1||
00221054|PredictedRefractiveError|Predicted Refractive Error|FL|1||
00221059|OphthalmicAxialLengthVelocity|Ophthalmic Axial Length Velocity|FL|1||
00221065|LensStatusDescription|Lens Status Description|LO|1||
00221066|VitreousStatusDescription|Vitreous Status Description|LO|1||
00221090|IOLPowerSequence|IOL Power Sequence|SQ|1||
00221092|LensConstantSequence|Lens Constant Sequence|SQ|1||
00221093|IOLManufacturer|IOL Manufacturer|LO|1||
00221094|LensConstantDescription|Lens Constant Description|LO|1|R|
00221095|ImplantName|Implant Name|LO|1||
00221096|KeratometryMeasurementTypeCodeSequence|Keratometry Measurement Type Code Sequence|SQ|1||
00221097|ImplantPartNumber|Implant Part Number|LO|1||
00221100|ReferencedOphthalmicAxialMeasurementsSequence|Referenced Ophthalmic Axial Measurements Sequence|SQ|1||
00221101|OphthalmicAxialLengthMeasurementsSegmentNameCodeSequence|Ophthalmic Axial Length Measurements Segment Name Code Sequence|SQ|1||
00221103|RefractiveErrorBeforeRefractiveSurgeryCodeSequence|Refractive Error Before Refractive Surgery Code Sequence|SQ|1||
00221121|IOLPowerForExactEmmetropia|IOL Power For Exact Emmetropia|FL|1||
00221122|IOLPowerForExactTargetRefraction|IOL Power For Exact Target Refraction|FL|1||
00221125|AnteriorChamberDepthDefinitionCodeSequence|Anterior Chamber Depth Definition Code Sequence|SQ|1||
00221127|LensThicknessSequence|Lens Thickness Sequence|SQ|1||
00221128|AnteriorChamberDepthSequence|Anterior Chamber Depth Sequence|SQ|1||
0022112A|CalculationCommentSequence|Calculation Comment Sequence|SQ|1||
0022112B|CalculationCommentType|Calculation Comment Type|CS|1||
0022112C|CalculationComment|Calculation Comment|LT|1||
00221130|LensThickness|Lens Thickness|FL|1||
00221131|AnteriorChamberDepth|Anterior Chamber Depth|FL|1||
00221132|SourceOfLensThicknessDataCodeSequence|Source of Lens Thickness Data Code Sequence|SQ|1||
00221133|SourceOfAnteriorChamberDepthDataCodeSequence|Source of Anterior Chamber Depth Data Code Sequence|SQ|1||
00221134|SourceOfRefractiveMeasurementsSequence|Source of Refractive Measurements Sequence|SQ|1||
00221135|SourceOfRefractiveMeasurementsCodeSequence|Source of Refractive Measurements Code Sequence|SQ|1||
00221140|OphthalmicAxialLengthMeasurementModified|Ophthalmic Axial Length Measurement Modified|CS|1||
00221150|OphthalmicAxialLengthDataSourceCodeSequence|Ophthalmic Axial Length Data Source Code Sequence|SQ|1||
00221153|OphthalmicAxialLengthAcquisitionMethodCodeSequence|Ophthalmic Axial Length Acquisition Method Code Sequence|SQ|1|R|
00221155|SignalToNoiseRatio|Signal to Noise Ratio|FL|1||
00221159|OphthalmicAxialLengthDataSourceDescription|Ophthalmic Axial Length Data Source Description|LO|1||
00221210|OphthalmicAxialLengthMeasurementsTotalLengthSequence|Ophthalmic Axial Length Measurements Total Length Sequence|SQ|1||
00221211|OphthalmicAxialLengthMeasurementsSegmentalLengthSequence|Ophthalmic Axial Length Measurements Segmental Length Sequence|SQ|1||
00221212|OphthalmicAxialLengthMeasurementsLengthSummationSequence|Ophthalmic Axial Length Measurements Length Summation Sequence|SQ|1||
00221220|UltrasoundOphthalmicAxialLengthMeasurementsSequence|Ultrasound Ophthalmic Axial Length Measurements Sequence|SQ|1||
00221225|OpticalOphthalmicAxialLengthMeasurementsSequence|Optical Ophthalmic Axial Length Measurements Sequence|SQ|1||
00221230|UltrasoundSelectedOphthalmicAxialLengthSequence|Ultrasound Selected Ophthalmic Axial Length Sequence|SQ|1||
00221250|OphthalmicAxialLengthSelectionMethodCodeSequence|Ophthalmic Axial Length Selection Method Code Sequence|SQ|1||
00221255|OpticalSelectedOphthalmicAxialLengthSequence|Optical Selected Ophthalmic Axial Length Sequence|SQ|1||
00221257|SelectedSegmentalOphthalmicAxialLengthSequence|Selected Segmental Ophthalmic Axial Length Sequence|SQ|1||
00221260|SelectedTotalOphthalmicAxialLengthSequence|Selected Total Ophthalmic Axial Length Sequence|SQ|1||
00221262|OphthalmicAxialLengthQualityMetricSequence|Ophthalmic Axial Length Quality Metric Sequence|SQ|1||
00221265|OphthalmicAxialLengthQualityMetricTypeCodeSequence|Ophthalmic Axial Length Quality Metric Type Code Sequence|SQ|1|R|
00221273|OphthalmicAxialLengthQualityMetricTypeDescription|Ophthalmic Axial Length Quality Metric Type Description|LO|1|R|
00221300|IntraocularLensCalculationsRightEyeSequence|Intraocular Lens Calculations Right Eye Sequence|SQ|1||
00221310|IntraocularLensCalculationsLeftEyeSequence|Intraocular Lens Calculations Left Eye Sequence|SQ|1||
00221330|ReferencedOphthalmicAxialLengthMeasurementQCImageSequence|Referenced Ophthalmic Axial Length Measurement QC Image Sequence|SQ|1||
00221415|OphthalmicMappingDeviceType|Ophthalmic Mapping Device Type|CS|1||
00221420|AcquisitionMethodCodeSequence|Acquisition Method Code Sequence|SQ|1||
00221423|AcquisitionMethodAlgorithmSequence|Acquisition Method Algorithm Sequence|SQ|1||
00221436|OphthalmicThicknessMapTypeCodeSequence|Ophthalmic Thickness Map Type Code Sequence|SQ|1||
00221443|OphthalmicThicknessMappingNormalsSequence|Ophthalmic Thickness Mapping Normals Sequence|SQ|1||
00221445|RetinalThicknessDefinitionCodeSequence|Retinal Thickness Definition Code Sequence|SQ|1||
00221450|PixelValueMappingToCodedConceptSequence|Pixel Value Mapping to Coded Concept Sequence|SQ|1||
00221452|MappedPixelValue|Mapped Pixel Value|US/SS|1||
00221454|PixelValueMappingExplanation|Pixel Value Mapping Explanation|LO|1||
00221458|OphthalmicThicknessMapQualityThresholdSequence|Ophthalmic Thickness Map Quality Threshold Sequence|SQ|1||
00221460|OphthalmicThicknessMapThresholdQualityRating|Ophthalmic Thickness Map Threshold Quality Rating|FL|1||
00221463|AnatomicStructureReferencePoint|Anatomic Structure Reference Point|FL|2||
00221465|RegistrationToLocalizerSequence|Registration to Localizer Sequence|SQ|1||
00221466|RegisteredLocalizerUnits|Registered Localizer Units|CS|1||
00221467|RegisteredLocalizerTopLeftHandCorner|Registered Localizer Top Left Hand Corner|FL|2||
00221468|RegisteredLocalizerBottomRightHandCorner|Registered Localizer Bottom Right Hand Corner|FL|2||
00221470|OphthalmicThicknessMapQualityRatingSequence|Ophthalmic Thickness Map Quality Rating Sequence|SQ|1||
00221472|RelevantOPTAttributesSequence|Relevant OPT Attributes Sequence|SQ|1||
00221512|TransformationMethodCodeSequence|Transformation Method Code Sequence|SQ|1||
00221513|TransformationAlgorithmSequence|Transformation Algorithm Sequence|SQ|1||
00221515|OphthalmicAxialLengthMethod|Ophthalmic Axial Length Method|CS|1||
00221517|OphthalmicFOV|Ophthalmic FOV|FL|1||
00221518|TwoDimensionalToThreeDimensionalMapSequence|Two Dimensional to Three Dimensional Map Sequence|SQ|1||
00221525|WideFieldOphthalmicPhotographyQualityRatingSequence|Wide Field Ophthalmic Photography Quality Rating Sequence|SQ|1||
00221526|WideFieldOphthalmicPhotographyQualityThresholdSequence|Wide Field Ophthalmic Photography Quality Threshold Sequence|SQ|1||
00221527|WideFieldOphthalmicPhotographyThresholdQualityRating|Wide Field Ophthalmic Photography Threshold Quality Rating|FL|1||
00221528|XCoordinatesCenterPixelViewAngle|X Coordinates Center Pixel View Angle|FL|1||
00221529|YCoordinatesCenterPixelViewAngle|Y Coordinates Center Pixel View Angle|FL|1||
00221530|NumberOfMapPoints|Number of Map Points|UL|1||
00221531|TwoDimensionalToThreeDimensionalMapData|Two Dimensional to Three Dimensional Map Data|OF|1||
00221612|DerivationAlgorithmSequence|Derivation Algorithm Sequence|SQ|1||
00221615|OphthalmicImageTypeCodeSequence|Ophthalmic Image Type Code Sequence|SQ|1||
00221616|OphthalmicImageTypeDescription|Ophthalmic Image Type Description|LO|1||
00221618|ScanPatternTypeCodeSequence|Scan Pattern Type Code Sequence|SQ|1||
00221620|ReferencedSurfaceMeshIdentificationSequence|Referenced Surface Mesh Identification Sequence|SQ|1||
00221622|OphthalmicVolumetricPropertiesFlag|Ophthalmic Volumetric Properties Flag|CS|1||
00221623|OphthalmicAnatomicReferencePointFrameCoordinate|Ophthalmic Anatomic Reference Point Frame Coordinate|FL|1||
00221624|OphthalmicAnatomicReferencePointXCoordinate|Ophthalmic Anatomic Reference Point X-Coordinate|FL|1||
00221626|OphthalmicAnatomicReferencePointYCoordinate|Ophthalmic Anatomic Reference Point Y-Coordinate|FL|1||
00221627|OphthalmicEnFaceVolumeDescriptorSequence|Ophthalmic En Face Volume Descriptor Sequence|SQ|1||
00221628|OphthalmicEnFaceImageQualityRatingSequence|Ophthalmic En Face Image Quality Rating Sequence|SQ|1||
00221629|OphthalmicEnFaceVolumeDescriptorScope|Ophthalmic En Face Volume Descriptor Scope|CS|1||
00221630|QualityThreshold|Quality Threshold|DS|1||
00221632|OphthalmicAnatomicReferencePointSequence|Ophthalmic Anatomic Reference Point Sequence|SQ|1||
00221633|OphthalmicAnatomicReferencePointLocalizationType|Ophthalmic Anatomic Reference Point Localization Type|CS|1||
00221634|PrimaryAnatomicStructureItemIndex|Primary Anatomic Structure Item Index|IS|1||
00221640|OCTBscanAnalysisAcquisitionParametersSequence|OCT B-scan Analysis Acquisition Parameters Sequence|SQ|1||
00221642|NumberOfBscansPerFrame|Number of B-scans Per Frame|UL|1||
00221643|BscanSlabThickness|B-scan Slab Thickness|FL|1||
00221644|DistanceBetweenBscanSlabs|Distance Between B-scan Slabs|FL|1||
00221645|BscanCycleTime|B-scan Cycle Time|FL|1||
00221646|BscanCycleTimeVector|B-scan Cycle Time Vector|FL|1-n||
00221649|AscanRate|A-scan Rate|FL|1||
00221650|BscanRate|B-scan Rate|FL|1||
00221658|SurfaceMeshZPixelOffset|Surface Mesh Z-Pixel Offset|UL|1||
00240010|VisualFieldHorizontalExtent|Visual Field Horizontal Extent|FL|1||
00240011|VisualFieldVerticalExtent|Visual Field Vertical Extent|FL|1||
00240012|VisualFieldShape|Visual Field Shape|CS|1||
00240016|ScreeningTestModeCodeSequence|Screening Test Mode Code Sequence|SQ|1||
00240018|MaximumStimulusLuminance|Maximum Stimulus Luminance|FL|1||
00240020|BackgroundLuminance|Background Luminance|FL|1||
00240021|StimulusColorCodeSequence|Stimulus Color Code Sequence|SQ|1||
00240024|BackgroundIlluminationColorCodeSequence|Background Illumination Color Code Sequence|SQ|1||
00240025|StimulusArea|Stimulus Area|FL|1||
00240028|StimulusPresentationTime|Stimulus Presentation Time|FL|1||
00240032|FixationSequence|Fixation Sequence|SQ|1||
00240033|FixationMonitoringCodeSequence|Fixation Monitoring Code Sequence|SQ|1||
00240034|VisualFieldCatchTrialSequence|Visual Field Catch Trial Sequence|SQ|1||
00240035|FixationCheckedQuantity|Fixation Checked Quantity|US|1||
00240036|PatientNotProperlyFixatedQuantity|Patient Not Properly Fixated Quantity|US|1||
00240037|PresentedVisualStimuliDataFlag|Presented Visual Stimuli Data Flag|CS|1||
00240038|NumberOfVisualStimuli|Number of Visual Stimuli|US|1||
00240039|ExcessiveFixationLossesDataFlag|Excessive Fixation Losses Data Flag|CS|1||
00240040|ExcessiveFixationLosses|Excessive Fixation Losses|CS|1||
00240042|StimuliRetestingQuantity|Stimuli Retesting Quantity|US|1||
00240044|CommentsOnPatientPerformanceOfVisualField|Comments on Patient's Performance of Visual Field|LT|1||
00240045|FalseNegativesEstimateFlag|False Negatives Estimate Flag|CS|1||
00240046|FalseNegativesEstimate|False Negatives Estimate|FL|1||
00240048|NegativeCatchTrialsQuantity|Negative Catch Trials Quantity|US|1||
00240050|FalseNegativesQuantity|False Negatives Quantity|US|1||
00240051|ExcessiveFalseNegativesDataFlag|Excessive False Negatives Data Flag|CS|1||
00240052|ExcessiveFalseNegatives|Excessive False Negatives|CS|1||
00240053|FalsePositivesEstimateFlag|False Positives Estimate Flag|CS|1||
00240054|FalsePositivesEstimate|False Positives Estimate|FL|1||
00240055|CatchTrialsDataFlag|Catch Trials Data Flag|CS|1||
00240056|PositiveCatchTrialsQuantity|Positive Catch Trials Quantity|US|1||
00240057|TestPointNormalsDataFlag|Test Point Normals Data Flag|CS|1||
00240058|TestPointNormalsSequence|Test Point Normals Sequence|SQ|1||
00240059|GlobalDeviationProbabilityNormalsFlag|Global Deviation Probability Normals Flag|CS|1||
00240060|FalsePositivesQuantity|False Positives Quantity|US|1||
00240061|ExcessiveFalsePositivesDataFlag|Excessive False Positives Data Flag|CS|1||
00240062|ExcessiveFalsePositives|Excessive False Positives|CS|1||
00240063|VisualFieldTestNormalsFlag|Visual Field Test Normals Flag|CS|1||
00240064|ResultsNormalsSequence|Results Normals Sequence|SQ|1||
00240065|AgeCorrectedSensitivityDeviationAlgorithmSequence|Age Corrected Sensitivity Deviation Algorithm Sequence|SQ|1||
00240066|GlobalDeviationFromNormal|Global Deviation From Normal|FL|1||
00240067|GeneralizedDefectSensitivityDeviationAlgorithmSequence|Generalized Defect Sensitivity Deviation Algorithm Sequence|SQ|1||
00240068|LocalizedDeviationFromNormal|Localized Deviation From Normal|FL|1||
00240069|PatientReliabilityIndicator|Patient Reliability Indicator|LO|1||
00240070|VisualFieldMeanSensitivity|Visual Field Mean Sensitivity|FL|1||
00240071|GlobalDeviationProbability|Global Deviation Probability|FL|1||
00240072|LocalDeviationProbabilityNormalsFlag|Local Deviation Probability Normals Flag|CS|1||
00240073|LocalizedDeviationProbability|Localized Deviation Probability|FL|1||
00240074|ShortTermFluctuationCalculated|Short Term Fluctuation Calculated|CS|1||
00240075|ShortTermFluctuation|Short Term Fluctuation|FL|1||
00240076|ShortTermFluctuationProbabilityCalculated|Short Term Fluctuation Probability Calculated|CS|1||
00240077|ShortTermFluctuationProbability|Short Term Fluctuation Probability|FL|1||
00240078|CorrectedLocalizedDeviationFromNormalCalculated|Corrected Localized Deviation From Normal Calculated|CS|1||
00240079|CorrectedLocalizedDeviationFromNormal|Corrected Localized Deviation From Normal|FL|1||
00240080|CorrectedLocalizedDeviationFromNormalProbabilityCalculated|Corrected Localized Deviation From Normal Probability Calculated|CS|1||
00240081|CorrectedLocalizedDeviationFromNormalProbability|Corrected Localized Deviation From Normal Probability|FL|1||
00240083|GlobalDeviationProbabilitySequence|Global Deviation Probability Sequence|SQ|1||
00240085|LocalizedDeviationProbabilitySequence|Localized Deviation Probability Sequence|SQ|1||
00240086|FovealSensitivityMeasured|Foveal Sensitivity Measured|CS|1||
00240087|FovealSensitivity|Foveal Sensitivity|FL|1||
00240088|VisualFieldTestDuration|Visual Field Test Duration|FL|1||
00240089|VisualFieldTestPointSequence|Visual Field Test Point Sequence|SQ|1||
00240090|VisualFieldTestPointXCoordinate|Visual Field Test Point X-Coordinate|FL|1||
00240091|VisualFieldTestPointYCoordinate|Visual Field Test Point Y-Coordinate|FL|1||
00240092|AgeCorrectedSensitivityDeviationValue|Age Corrected Sensitivity Deviation Value|FL|1||
00240093|StimulusResults|Stimulus Results|CS|1||
00240094|SensitivityValue|Sensitivity Value|FL|1||
00240095|RetestStimulusSeen|Retest Stimulus Seen|CS|1||
00240096|RetestSensitivityValue|Retest Sensitivity Value|FL|1||
00240097|VisualFieldTestPointNormalsSequence|Visual Field Test Point Normals Sequence|SQ|1||
00240098|QuantifiedDefect|Quantified Defect|FL|1||
00240100|AgeCorrectedSensitivityDeviationProbabilityValue|Age Corrected Sensitivity Deviation Probability Value|FL|1||
00240102|GeneralizedDefectCorrectedSensitivityDeviationFlag|Generalized Defect Corrected Sensitivity Deviation Flag|CS|1||
00240103|GeneralizedDefectCorrectedSensitivityDeviationValue|Generalized Defect Corrected Sensitivity Deviation Value|FL|1||
00240104|GeneralizedDefectCorrectedSensitivityDeviationProbabilityValue|Generalized Defect Corrected Sensitivity Deviation Probability Value|FL|1||
00240105|MinimumSensitivityValue|Minimum Sensitivity Value|FL|1||
00240106|BlindSpotLocalized|Blind Spot Localized|CS|1||
00240107|BlindSpotXCoordinate|Blind Spot X-Coordinate|FL|1||
00240108|BlindSpotYCoordinate|Blind Spot Y-Coordinate|FL|1||
00240110|VisualAcuityMeasurementSequence|Visual Acuity Measurement Sequence|SQ|1||
00240112|RefractiveParametersUsedOnPatientSequence|Refractive Parameters Used on Patient Sequence|SQ|1||
00240113|MeasurementLaterality|Measurement Laterality|CS|1||
00240114|OphthalmicPatientClinicalInformationLeftEyeSequence|Ophthalmic Patient Clinical Information Left Eye Sequence|SQ|1||
00240115|OphthalmicPatientClinicalInformationRightEyeSequence|Ophthalmic Patient Clinical Information Right Eye Sequence|SQ|1||
00240117|FovealPointNormativeDataFlag|Foveal Point Normative Data Flag|CS|1||
00240118|FovealPointProbabilityValue|Foveal Point Probability Value|FL|1||
00240120|ScreeningBaselineMeasured|Screening Baseline Measured|CS|1||
00240122|ScreeningBaselineMeasuredSequence|Screening Baseline Measured Sequence|SQ|1||
00240124|ScreeningBaselineType|Screening Baseline Type|CS|1||
00240126|ScreeningBaselineValue|Screening Baseline Value|FL|1||
00240202|AlgorithmSource|Algorithm Source|LO|1||
00240306|DataSetName|Data Set Name|LO|1||
00240307|DataSetVersion|Data Set Version|LO|1||
00240308|DataSetSource|Data Set Source|LO|1||
00240309|DataSetDescription|Data Set Description|LO|1||
00240317|VisualFieldTestReliabilityGlobalIndexSequence|Visual Field Test Reliability Global Index Sequence|SQ|1||
00240320|VisualFieldGlobalResultsIndexSequence|Visual Field Global Results Index Sequence|SQ|1||
00240325|DataObservationSequence|Data Observation Sequence|SQ|1||
00240338|IndexNormalsFlag|Index Normals Flag|CS|1||
00240341|IndexProbability|Index Probability|FL|1||
00240344|IndexProbabilitySequence|Index Probability Sequence|SQ|1||
00280002|SamplesPerPixel|Samples per Pixel|US|1||
00280003|SamplesPerPixelUsed|Samples per Pixel Used|US|1||
00280004|PhotometricInterpretation|Photometric Interpretation|CS|1||
00280005|ImageDimensions|Image Dimensions|US|1|R|
00280006|PlanarConfiguration|Planar Configuration|US|1||
00280008|NumberOfFrames|Number of Frames|IS|1||
00280009|FrameIncrementPointer|Frame Increment Pointer|AT|1-n||
0028000A|FrameDimensionPointer|Frame Dimension Pointer|AT|1-n||
00280010|Rows|Rows|US|1||
00280011|Columns|Columns|US|1||
00280012|Planes|Planes|US|1|R|
00280014|UltrasoundColorDataPresent|Ultrasound Color Data Present|US|1||
00280020|||||R|
00280030|PixelSpacing|Pixel Spacing|DS|2||
00280031|ZoomFactor|Zoom Factor|DS|2||
00280032|ZoomCenter|Zoom Center|DS|2||
00280034|PixelAspectRatio|Pixel Aspect Ratio|IS|2||
00280040|ImageFormat|Image Format|CS|1|R|
00280050|ManipulatedImage|Manipulated Image|LO|1-n|R|
00280051|CorrectedImage|Corrected Image|CS|1-n||
0028005F|CompressionRecognitionCode|Compression Recognition Code|LO|1|R|
00280060|CompressionCode|Compression Code|CS|1|R|
00280061|CompressionOriginator|Compression Originator|SH|1|R|
00280062|CompressionLabel|Compression Label|LO|1|R|
00280063|CompressionDescription|Compression Description|SH|1|R|
00280065|CompressionSequence|Compression Sequence|CS|1-n|R|
00280066|CompressionStepPointers|Compression Step Pointers|AT|1-n|R|
00280068|RepeatInterval|Repeat Interval|US|1|R|
00280069|BitsGrouped|Bits Grouped|US|1|R|
00280070|PerimeterTable|Perimeter Table|US|1-n|R|
00280071|PerimeterValue|Perimeter Value|US/SS|1|R|
00280080|PredictorRows|Predictor Rows|US|1|R|
00280081|PredictorColumns|Predictor Columns|US|1|R|
00280082|PredictorConstants|Predictor Constants|US|1-n|R|
00280090|BlockedPixels|Blocked Pixels|CS|1|R|
00280091|BlockRows|Block Rows|US|1|R|
00280092|BlockColumns|Block Columns|US|1|R|
00280093|RowOverlap|Row Overlap|US|1|R|
00280094|ColumnOverlap|Column Overlap|US|1|R|
00280100|BitsAllocated|Bits Allocated|US|1||
00280101|BitsStored|Bits Stored|US|1||
00280102|HighBit|High Bit|US|1||
00280103|PixelRepresentation|Pixel Representation|US|1||
00280104|SmallestValidPixelValue|Smallest Valid Pixel Value|US/SS|1|R|
00280105|LargestValidPixelValue|Largest Valid Pixel Value|US/SS|1|R|
00280106|SmallestImagePixelValue|Smallest Image Pixel Value|US/SS|1||
00280107|LargestImagePixelValue|Largest Image Pixel Value|US/SS|1||
00280108|SmallestPixelValueInSeries|Smallest Pixel Value in Series|US/SS|1||
00280109|LargestPixelValueInSeries|Largest Pixel Value in Series|US/SS|1||
00280110|SmallestImagePixelValueInPlane|Smallest Image Pixel Value in Plane|US/SS|1|R|
00280111|LargestImagePixelValueInPlane|Largest Image Pixel Value in Plane|US/SS|1|R|
00280120|PixelPaddingValue|Pixel Padding Value|US/SS|1||
00280121|PixelPaddingRangeLimit|Pixel Padding Range Limit|US/SS|1||
00280122|FloatPixelPaddingValue|Float Pixel Padding Value|FL|1||
00280123|DoubleFloatPixelPaddingValue|Double Float Pixel Padding Value|FD|1||
00280124|FloatPixelPaddingRangeLimit|Float Pixel Padding Range Limit|FL|1||
00280125|DoubleFloatPixelPaddingRangeLimit|Double Float Pixel Padding Range Limit|FD|1||
00280200|ImageLocation|Image Location|US|1|R|
00280300|QualityControlImage|Quality Control Image|CS|1||
00280301|BurnedInAnnotation|Burned In Annotation|CS|1||
00280302|RecognizableVisualFeatures|Recognizable Visual Features|CS|1||
00280303|LongitudinalTemporalInformationModified|Longitudinal Temporal Information Modified|CS|1||
00280304|ReferencedColorPaletteInstanceUID|Referenced Color Palette Instance UID|UI|1||
00280400|TransformLabel|Transform Label|LO|1|R|
00280401|TransformVersionNumber|Transform Version Number|LO|1|R|
00280402|NumberOfTransformSteps|Number of Transform Steps|US|1|R|
00280403|SequenceOfCompressedData|Sequence of Compressed Data|LO|1-n|R|
00280404|DetailsOfCoefficients|Details of Coefficients|AT|1-n|R|
002804x0|RowsForNthOrderCoefficients|Rows For Nth Order Coefficients|US|1|R|x
002804x1|ColumnsForNthOrderCoefficients|Columns For Nth Order Coefficients|US|1|R|x
002804x2|CoefficientCoding|Coefficient Coding|LO|1-n|R|x
002804x3|CoefficientCodingPointers|Coefficient Coding Pointers|AT|1-n|R|x
00280700|DCTLabel|DCT Label|LO|1|R|
00280701|DataBlockDescription|Data Block Description|CS|1-n|R|
00280702|DataBlock|Data Block|AT|1-n|R|
00280710|NormalizationFactorFormat|Normalization Factor Format|US|1|R|
00280720|ZonalMapNumberFormat|Zonal Map Number Format|US|1|R|
00280721|ZonalMapLocation|Zonal Map Location|AT|1-n|R|
00280722|ZonalMapFormat|Zonal Map Format|US|1|R|
00280730|AdaptiveMapFormat|Adaptive Map Format|US|1|R|
00280740|CodeNumberFormat|Code Number Format|US|1|R|
002808x0|CodeLabel|Code Label|CS|1-n|R|x
002808x2|NumberOfTables|Number of Tables|US|1|R|x
002808x3|CodeTableLocation|Code Table Location|AT|1-n|R|x
002808x4|BitsForCodeWord|Bits For Code Word|US|1|R|x
002808x8|ImageDataLocation|Image Data Location|AT|1-n|R|x
00280A02|PixelSpacingCalibrationType|Pixel Spacing Calibration Type|CS|1||
00280A04|PixelSpacingCalibrationDescription|Pixel Spacing Calibration Description|LO|1||
00281040|PixelIntensityRelationship|Pixel Intensity Relationship|CS|1||
00281041|PixelIntensityRelationshipSign|Pixel Intensity Relationship Sign|SS|1||
00281050|WindowCenter|Window Center|DS|1-n||
00281051|WindowWidth|Window Width|DS|1-n||
00281052|RescaleIntercept|Rescale Intercept|DS|1||
00281053|RescaleSlope|Rescale Slope|DS|1||
00281054|RescaleType|Rescale Type|LO|1||
00281055|WindowCenterWidthExplanation|Window Center & Width Explanation|LO|1-n||
00281056|VOILUTFunction|VOI LUT Function|CS|1||
00281080|GrayScale|Gray Scale|CS|1|R|
00281090|RecommendedViewingMode|Recommended Viewing Mode|CS|1||
00281100|GrayLookupTableDescriptor|Gray Lookup Table Descriptor|US/SS|3|R|
00281101|RedPaletteColorLookupTableDescriptor|Red Palette Color Lookup Table Descriptor|US/SS|3||
00281102|GreenPaletteColorLookupTableDescriptor|Green Palette Color Lookup Table Descriptor|US/SS|3||
00281103|BluePaletteColorLookupTableDescriptor|Blue Palette Color Lookup Table Descriptor|US/SS|3||
00281104|AlphaPaletteColorLookupTableDescriptor|Alpha Palette Color Lookup Table Descriptor|US|3||
00281111|LargeRedPaletteColorLookupTableDescriptor|Large Red Palette Color Lookup Table Descriptor|US/SS|4|R|
00281112|LargeGreenPaletteColorLookupTableDescriptor|Large Green Palette Color Lookup Table Descriptor|US/SS|4|R|
00281113|LargeBluePaletteColorLookupTableDescriptor|Large Blue Palette Color Lookup Table Descriptor|US/SS|4|R|
00281199|PaletteColorLookupTableUID|Palette Color Lookup Table UID|UI|1||
00281200|GrayLookupTableData|Gray Lookup Table Data|US/SS/OW|1-n or 1|R|
00281201|RedPaletteColorLookupTableData|Red Palette Color Lookup Table Data|OW|1||
00281202|GreenPaletteColorLookupTableData|Green Palette Color Lookup Table Data|OW|1||
00281203|BluePaletteColorLookupTableData|Blue Palette Color Lookup Table Data|OW|1||
00281204|AlphaPaletteColorLookupTableData|Alpha Palette Color Lookup Table Data|OW|1||
00281211|LargeRedPaletteColorLookupTableData|Large Red Palette Color Lookup Table Data|OW|1|R|
00281212|LargeGreenPaletteColorLookupTableData|Large Green Palette Color Lookup Table Data|OW|1|R|
00281213|LargeBluePaletteColorLookupTableData|Large Blue Palette Color Lookup Table Data|OW|1|R|
00281214|LargePaletteColorLookupTableUID|Large Palette Color Lookup Table UID|UI|1|R|
00281221|SegmentedRedPaletteColorLookupTableData|Segmented Red Palette Color Lookup Table Data|OW|1||
00281222|SegmentedGreenPaletteColorLookupTableData|Segmented Green Palette Color Lookup Table Data|OW|1||
00281223|SegmentedBluePaletteColorLookupTableData|Segmented Blue Palette Color Lookup Table Data|OW|1||
00281224|SegmentedAlphaPaletteColorLookupTableData|Segmented Alpha Palette Color Lookup Table Data|OW|1||
00281230|StoredValueColorRangeSequence|Stored Value Color Range Sequence|SQ|1||
00281231|MinimumStoredValueMapped|Minimum Stored Value Mapped|FD|1||
00281232|MaximumStoredValueMapped|Maximum Stored Value Mapped|FD|1||
00281300|BreastImplantPresent|Breast Implant Present|CS|1||
00281350|PartialView|Partial View|CS|1||
00281351|PartialViewDescription|Partial View Description|ST|1||
00281352|PartialViewCodeSequence|Partial View Code Sequence|SQ|1||
0028135A|SpatialLocationsPreserved|Spatial Locations Preserved|CS|1||
00281401|DataFrameAssignmentSequence|Data Frame Assignment Sequence|SQ|1||
00281402|DataPathAssignment|Data Path Assignment|CS|1||
00281403|BitsMappedToColorLookupTable|Bits Mapped to Color Lookup Table|US|1||
00281404|BlendingLUT1Sequence|Blending LUT 1 Sequence|SQ|1||
00281405|BlendingLUT1TransferFunction|Blending LUT 1 Transfer Function|CS|1||
00281406|BlendingWeightConstant|Blending Weight Constant|FD|1||
00281407|BlendingLookupTableDescriptor|Blending Lookup Table Descriptor|US|3||
00281408|BlendingLookupTableData|Blending Lookup Table Data|OW|1||
0028140B|EnhancedPaletteColorLookupTableSequence|Enhanced Palette Color Lookup Table Sequence|SQ|1||
0028140C|BlendingLUT2Sequence|Blending LUT 2 Sequence|SQ|1||
0028140D|BlendingLUT2TransferFunction|Blending LUT 2 Transfer Function|CS|1||
0028140E|DataPathID|Data Path ID|CS|1||
0028140F|RGBLUTTransferFunction|RGB LUT Transfer Function|CS|1||
00281410|AlphaLUTTransferFunction|Alpha LUT Transfer Function|CS|1||
00282000|ICCProfile|ICC Profile|OB|1||
00282002|ColorSpace|Color Space|CS|1||
00282110|LossyImageCompression|Lossy Image Compression|CS|1||
00282112|LossyImageCompressionRatio|Lossy Image Compression Ratio|DS|1-n||
00282114|LossyImageCompressionMethod|Lossy Image Compression Method|CS|1-n||
00283000|ModalityLUTSequence|Modality LUT Sequence|SQ|1||
00283001|VariableModalityLUTSequence|Variable Modality LUT Sequence|SQ|1||
00283002|LUTDescriptor|LUT Descriptor|US/SS|3||
00283003|LUTExplanation|LUT Explanation|LO|1||
00283004|ModalityLUTType|Modality LUT Type|LO|1||
00283006|LUTData|LUT Data|US/OW|1-n or 1||
00283010|VOILUTSequence|VOI LUT Sequence|SQ|1||
00283110|SoftcopyVOILUTSequence|Softcopy VOI LUT Sequence|SQ|1||
00284000|ImagePresentationComments|Image Presentation Comments|LT|1|R|
00285000|BiPlaneAcquisitionSequence|Bi-Plane Acquisition Sequence|SQ|1|R|
00286010|RepresentativeFrameNumber|Representative Frame Number|US|1||
00286020|FrameNumbersOfInterest|Frame Numbers of Interest (FOI)|US|1-n||
00286022|FrameOfInterestDescription|Frame of Interest Description|LO|1-n||
00286023|FrameOfInterestType|Frame of Interest Type|CS|1-n||
00286030|MaskPointers|Mask Pointer(s)|US|1-n|R|
00286040|RWavePointer|R Wave Pointer|US|1-n||
00286100|MaskSubtractionSequence|Mask Subtraction Sequence|SQ|1||
00286101|MaskOperation|Mask Operation|CS|1||
00286102|ApplicableFrameRange|Applicable Frame Range|US|2-2n||
00286110|MaskFrameNumbers|Mask Frame Numbers|US|1-n||
00286112|ContrastFrameAveraging|Contrast Frame Averaging|US|1||
00286114|MaskSubPixelShift|Mask Sub-pixel Shift|FL|2||
00286120|TIDOffset|TID Offset|SS|1||
00286190|MaskOperationExplanation|Mask Operation Explanation|ST|1||
00287000|EquipmentAdministratorSequence|Equipment Administrator Sequence|SQ|1||
00287001|NumberOfDisplaySubsystems|Number of Display Subsystems|US|1||
00287002|CurrentConfigurationID|Current Configuration ID|US|1||
00287003|DisplaySubsystemID|Display Subsystem ID|US|1||
00287004|DisplaySubsystemName|Display Subsystem Name|SH|1||
00287005|DisplaySubsystemDescription|Display Subsystem Description|LO|1||
00287006|SystemStatus|System Status|CS|1||
00287007|SystemStatusComment|System Status Comment|LO|1||
00287008|TargetLuminanceCharacteristicsSequence|Target Luminance Characteristics Sequence|SQ|1||
00287009|LuminanceCharacteristicsID|Luminance Characteristics ID|US|1||
0028700A|DisplaySubsystemConfigurationSequence|Display Subsystem Configuration Sequence|SQ|1||
0028700B|ConfigurationID|Configuration ID|US|1||
0028700C|ConfigurationName|Configuration Name|SH|1||
0028700D|ConfigurationDescription|Configuration Description|LO|1||
0028700E|ReferencedTargetLuminanceCharacteristicsID|Referenced Target Luminance Characteristics ID|US|1||
0028700F|QAResultsSequence|QA Results Sequence|SQ|1||
00287010|DisplaySubsystemQAResultsSequence|Display Subsystem QA Results Sequence|SQ|1||
00287011|ConfigurationQAResultsSequence|Configuration QA Results Sequence|SQ|1||
00287012|MeasurementEquipmentSequence|Measurement Equipment Sequence|SQ|1||
00287013|MeasurementFunctions|Measurement Functions|CS|1-n||
00287014|MeasurementEquipmentType|Measurement Equipment Type|CS|1||
00287015|VisualEvaluationResultSequence|Visual Evaluation Result Sequence|SQ|1||
00287016|DisplayCalibrationResultSequence|Display Calibration Result Sequence|SQ|1||
00287017|DDLValue|DDL Value|US|1||
00287018|CIExyWhitePoint|CIExy White Point|FL|2||
00287019|DisplayFunctionType|Display Function Type|CS|1||
0028701A|GammaValue|Gamma Value|FL|1||
0028701B|NumberOfLuminancePoints|Number of Luminance Points|US|1||
0028701C|LuminanceResponseSequence|Luminance Response Sequence|SQ|1||
0028701D|TargetMinimumLuminance|Target Minimum Luminance|FL|1||
0028701E|TargetMaximumLuminance|Target Maximum Luminance|FL|1||
0028701F|LuminanceValue|Luminance Value|FL|1||
00287020|LuminanceResponseDescription|Luminance Response Description|LO|1||
00287021|WhitePointFlag|White Point Flag|CS|1||
00287022|DisplayDeviceTypeCodeSequence|Display Device Type Code Sequence|SQ|1||
00287023|DisplaySubsystemSequence|Display Subsystem Sequence|SQ|1||
00287024|LuminanceResultSequence|Luminance Result Sequence|SQ|1||
00287025|AmbientLightValueSource|Ambient Light Value Source|CS|1||
00287026|MeasuredCharacteristics|Measured Characteristics|CS|1-n||
00287027|LuminanceUniformityResultSequence|Luminance Uniformity Result Sequence|SQ|1||
00287028|VisualEvaluationTestSequence|Visual Evaluation Test Sequence|SQ|1||
00287029|TestResult|Test Result|CS|1||
0028702A|TestResultComment|Test Result Comment|LO|1||
0028702B|TestImageValidation|Test Image Validation|CS|1||
0028702C|TestPatternCodeSequence|Test Pattern Code Sequence|SQ|1||
0028702D|MeasurementPatternCodeSequence|Measurement Pattern Code Sequence|SQ|1||
0028702E|VisualEvaluationMethodCodeSequence|Visual Evaluation Method Code Sequence|SQ|1||
00287FE0|PixelDataProviderURL|Pixel Data Provider URL|UR|1||
00289001|DataPointRows|Data Point Rows|UL|1||
00289002|DataPointColumns|Data Point Columns|UL|1||
00289003|SignalDomainColumns|Signal Domain Columns|CS|1||
00289099|LargestMonochromePixelValue|Largest Monochrome Pixel Value|US|1|R|
00289108|DataRepresentation|Data Representation|CS|1||
00289110|PixelMeasuresSequence|Pixel Measures Sequence|SQ|1||
00289132|FrameVOILUTSequence|Frame VOI LUT Sequence|SQ|1||
00289145|PixelValueTransformationSequence|Pixel Value Transformation Sequence|SQ|1||
00289235|SignalDomainRows|Signal Domain Rows|CS|1||
00289411|DisplayFilterPercentage|Display Filter Percentage|FL|1||
00289415|FramePixelShiftSequence|Frame Pixel Shift Sequence|SQ|1||
00289416|SubtractionItemID|Subtraction Item ID|US|1||
00289422|PixelIntensityRelationshipLUTSequence|Pixel Intensity Relationship LUT Sequence|SQ|1||
00289443|FramePixelDataPropertiesSequence|Frame Pixel Data Properties Sequence|SQ|1||
00289444|GeometricalProperties|Geometrical Properties|CS|1||
00289445|GeometricMaximumDistortion|Geometric Maximum Distortion|FL|1||
00289446|ImageProcessingApplied|Image Processing Applied|CS|1-n||
00289454|MaskSelectionMode|Mask Selection Mode|CS|1||
00289474|LUTFunction|LUT Function|CS|1||
00289478|MaskVisibilityPercentage|Mask Visibility Percentage|FL|1||
00289501|PixelShiftSequence|Pixel Shift Sequence|SQ|1||
00289502|RegionPixelShiftSequence|Region Pixel Shift Sequence|SQ|1||
00289503|VerticesOfTheRegion|Vertices of the Region|SS|2-2n||
00289505|MultiFramePresentationSequence|Multi-frame Presentation Sequence|SQ|1||
00289506|PixelShiftFrameRange|Pixel Shift Frame Range|US|2-2n||
00289507|LUTFrameRange|LUT Frame Range|US|2-2n||
00289520|ImageToEquipmentMappingMatrix|Image to Equipment Mapping Matrix|DS|16||
00289537|EquipmentCoordinateSystemIdentification|Equipment Coordinate System Identification|CS|1||
0032000A|StudyStatusID|Study Status ID|CS|1|R|
0032000C|StudyPriorityID|Study Priority ID|CS|1|R|
00320012|StudyIDIssuer|Study ID Issuer|LO|1|R|
00320032|StudyVerifiedDate|Study Verified Date|DA|1|R|
00320033|StudyVerifiedTime|Study Verified Time|TM|1|R|
00320034|StudyReadDate|Study Read Date|DA|1|R|
00320035|StudyReadTime|Study Read Time|TM|1|R|
00321000|ScheduledStudyStartDate|Scheduled Study Start Date|DA|1|R|
00321001|ScheduledStudyStartTime|Scheduled Study Start Time|TM|1|R|
00321010|ScheduledStudyStopDate|Scheduled Study Stop Date|DA|1|R|
00321011|ScheduledStudyStopTime|Scheduled Study Stop Time|TM|1|R|
00321020|ScheduledStudyLocation|Scheduled Study Location|LO|1|R|
00321021|ScheduledStudyLocationAETitle|Scheduled Study Location AE Title|AE|1-n|R|
00321030|ReasonForStudy|Reason for Study|LO|1|R|
00321031|RequestingPhysicianIdentificationSequence|Requesting Physician Identification Sequence|SQ|1||
00321032|RequestingPhysician|Requesting Physician|PN|1||
00321033|RequestingService|Requesting Service|LO|1||
00321034|RequestingServiceCodeSequence|Requesting Service Code Sequence|SQ|1||
00321040|StudyArrivalDate|Study Arrival Date|DA|1|R|
00321041|StudyArrivalTime|Study Arrival Time|TM|1|R|
00321050|StudyCompletionDate|Study Completion Date|DA|1|R|
00321051|StudyCompletionTime|Study Completion Time|TM|1|R|
00321055|StudyComponentStatusID|Study Component Status ID|CS|1|R|
00321060|RequestedProcedureDescription|Requested Procedure Description|LO|1||
00321064|RequestedProcedureCodeSequence|Requested Procedure Code Sequence|SQ|1||
00321065|RequestedLateralityCodeSequence|Requested Laterality Code Sequence|SQ|1||
00321066|ReasonForVisit|Reason for Visit|UT|1||
00321067|ReasonForVisitCodeSequence|Reason for Visit Code Sequence|SQ|1||
00321070|RequestedContrastAgent|Requested Contrast Agent|LO|1||
00324000|StudyComments|Study Comments|LT|1|R|
00340001|FlowIdentifierSequence|Flow Identifier Sequence|SQ|1||
00340002|FlowIdentifier|Flow Identifier|OB|1||
00340003|FlowTransferSyntaxUID|Flow Transfer Syntax UID|UI|1||
00340004|FlowRTPSamplingRate|Flow RTP Sampling Rate|UL|1||
00340005|SourceIdentifier|Source Identifier|OB|1||
00340007|FrameOriginTimestamp|Frame Origin Timestamp|OB|1||
00340008|IncludesImagingSubject|Includes Imaging Subject|CS|1||
00340009|FrameUsefulnessGroupSequence|Frame Usefulness Group Sequence|SQ|1||
0034000A|RealTimeBulkDataFlowSequence|Real-Time Bulk Data Flow Sequence|SQ|1||
0034000B|CameraPositionGroupSequence|Camera Position Group Sequence|SQ|1||
0034000C|IncludesInformation|Includes Information|CS|1||
0034000D|TimeOfFrameGroupSequence|Time of Frame Group Sequence|SQ|1||
00380004|ReferencedPatientAliasSequence|Referenced Patient Alias Sequence|SQ|1|R|
00380008|VisitStatusID|Visit Status ID|CS|1||
00380010|AdmissionID|Admission ID|LO|1||
00380011|IssuerOfAdmissionID|Issuer of Admission ID|LO|1|R|
00380014|IssuerOfAdmissionIDSequence|Issuer of Admission ID Sequence|SQ|1||
00380016|RouteOfAdmissions|Route of Admissions|LO|1||
0038001A|ScheduledAdmissionDate|Scheduled Admission Date|DA|1|R|
0038001B|ScheduledAdmissionTime|Scheduled Admission Time|TM|1|R|
0038001C|ScheduledDischargeDate|Scheduled Discharge Date|DA|1|R|
0038001D|ScheduledDischargeTime|Scheduled Discharge Time|TM|1|R|
0038001E|ScheduledPatientInstitutionResidence|Scheduled Patient Institution Residence|LO|1|R|
00380020|AdmittingDate|Admitting Date|DA|1||
00380021|AdmittingTime|Admitting Time|TM|1||
00380030|DischargeDate|Discharge Date|DA|1|R|
00380032|DischargeTime|Discharge Time|TM|1|R|
00380040|DischargeDiagnosisDescription|Discharge Diagnosis Description|LO|1|R|
00380044|DischargeDiagnosisCodeSequence|Discharge Diagnosis Code Sequence|SQ|1|R|
00380050|SpecialNeeds|Special Needs|LO|1||
00380060|ServiceEpisodeID|Service Episode ID|LO|1||
00380061|IssuerOfServiceEpisodeID|Issuer of Service Episode ID|LO|1|R|
00380062|ServiceEpisodeDescription|Service Episode Description|LO|1||
00380064|IssuerOfServiceEpisodeIDSequence|Issuer of Service Episode ID Sequence|SQ|1||
00380100|PertinentDocumentsSequence|Pertinent Documents Sequence|SQ|1||
00380101|PertinentResourcesSequence|Pertinent Resources Sequence|SQ|1||
00380102|ResourceDescription|Resource Description|LO|1||
00380300|CurrentPatientLocation|Current Patient Location|LO|1||
00380400|PatientInstitutionResidence|Patient's Institution Residence|LO|1||
00380500|PatientState|Patient State|LO|1||
00380502|PatientClinicalTrialParticipationSequence|Patient Clinical Trial Participation Sequence|SQ|1||
00384000|VisitComments|Visit Comments|LT|1||
003A0004|WaveformOriginality|Waveform Originality|CS|1||
003A0005|NumberOfWaveformChannels|Number of Waveform Channels|US|1||
003A0010|NumberOfWaveformSamples|Number of Waveform Samples|UL|1||
003A001A|SamplingFrequency|Sampling Frequency|DS|1||
003A0020|MultiplexGroupLabel|Multiplex Group Label|SH|1||
003A0200|ChannelDefinitionSequence|Channel Definition Sequence|SQ|1||
003A0202|WaveformChannelNumber|Waveform Channel Number|IS|1||
003A0203|ChannelLabel|Channel Label|SH|1||
003A0205|ChannelStatus|Channel Status|CS|1-n||
003A0208|ChannelSourceSequence|Channel Source Sequence|SQ|1||
003A0209|ChannelSourceModifiersSequence|Channel Source Modifiers Sequence|SQ|1||
003A020A|SourceWaveformSequence|Source Waveform Sequence|SQ|1||
003A020C|ChannelDerivationDescription|Channel Derivation Description|LO|1||
003A0210|ChannelSensitivity|Channel Sensitivity|DS|1||
003A0211|ChannelSensitivityUnitsSequence|Channel Sensitivity Units Sequence|SQ|1||
003A0212|ChannelSensitivityCorrectionFactor|Channel Sensitivity Correction Factor|DS|1||
003A0213|ChannelBaseline|Channel Baseline|DS|1||
003A0214|ChannelTimeSkew|Channel Time Skew|DS|1||
003A0215|ChannelSampleSkew|Channel Sample Skew|DS|1||
003A0218|ChannelOffset|Channel Offset|DS|1||
003A021A|WaveformBitsStored|Waveform Bits Stored|US|1||
003A0220|FilterLowFrequency|Filter Low Frequency|DS|1||
003A0221|FilterHighFrequency|Filter High Frequency|DS|1||
003A0222|NotchFilterFrequency|Notch Filter Frequency|DS|1||
003A0223|NotchFilterBandwidth|Notch Filter Bandwidth|DS|1||
003A0230|WaveformDataDisplayScale|Waveform Data Display Scale|FL|1||
003A0231|WaveformDisplayBackgroundCIELabValue|Waveform Display Background CIELab Value|US|3||
003A0240|WaveformPresentationGroupSequence|Waveform Presentation Group Sequence|SQ|1||
003A0241|PresentationGroupNumber|Presentation Group Number|US|1||
003A0242|ChannelDisplaySequence|Channel Display Sequence|SQ|1||
003A0244|ChannelRecommendedDisplayCIELabValue|Channel Recommended Display CIELab Value|US|3||
003A0245|ChannelPosition|Channel Position|FL|1||
003A0246|DisplayShadingFlag|Display Shading Flag|CS|1||
003A0247|FractionalChannelDisplayScale|Fractional Channel Display Scale|FL|1||
003A0248|AbsoluteChannelDisplayScale|Absolute Channel Display Scale|FL|1||
003A0300|MultiplexedAudioChannelsDescriptionCodeSequence|Multiplexed Audio Channels Description Code Sequence|SQ|1||
003A0301|ChannelIdentificationCode|Channel Identification Code|IS|1||
003A0302|ChannelMode|Channel Mode|CS|1||
003A0310|MultiplexGroupUID|Multiplex Group UID|UI|1||
003A0311|PowerlineFrequency|Powerline Frequency|DS|1||
003A0312|ChannelImpedanceSequence|Channel Impedance Sequence|SQ|1||
003A0313|ImpedanceValue|Impedance Value|DS|1||
003A0314|ImpedanceMeasurementDateTime|Impedance Measurement DateTime|DT|1||
003A0315|ImpedanceMeasurementFrequency|Impedance Measurement Frequency|DS|1||
003A0316|ImpedanceMeasurementCurrentType|Impedance Measurement Current Type|CS|1||
003A0317|WaveformAmplifierType|Waveform Amplifier Type|CS|1||
003A0318|FilterLowFrequencyCharacteristicsSequence|Filter Low Frequency Characteristics Sequence|SQ|1||
003A0319|FilterHighFrequencyCharacteristicsSequence|Filter High Frequency Characteristics Sequence|SQ|1||
003A0320|SummarizedFilterLookupTableSequence|Summarized Filter Lookup Table Sequence|SQ|1||
003A0321|NotchFilterCharacteristicsSequence|Notch Filter Characteristics Sequence|SQ|1||
003A0322|WaveformFilterType|Waveform Filter Type|CS|1||
003A0323|AnalogFilterCharacteristicsSequence|Analog Filter Characteristics Sequence|SQ|1||
003A0324|AnalogFilterRollOff|Analog Filter Roll Off|DS|1||
003A0325|AnalogFilterTypeCodeSequence|Analog Filter Type Code Sequence|SQ|1||
003A0326|DigitalFilterCharacteristicsSequence|Digital Filter Characteristics Sequence|SQ|1||
003A0327|DigitalFilterOrder|Digital Filter Order|IS|1||
003A0328|DigitalFilterTypeCodeSequence|Digital Filter Type Code Sequence|SQ|1||
003A0329|WaveformFilterDescription|Waveform Filter Description|ST|1||
003A032A|FilterLookupTableSequence|Filter Lookup Table Sequence|SQ|1||
003A032B|FilterLookupTableDescription|Filter Lookup Table Description|ST|1||
003A032C|FrequencyEncodingCodeSequence|Frequency Encoding Code Sequence|SQ|1||
003A032D|MagnitudeEncodingCodeSequence|Magnitude Encoding Code Sequence|SQ|1||
003A032E|FilterLookupTableData|Filter Lookup Table Data|OD|1||
00400001|ScheduledStationAETitle|Scheduled Station AE Title|AE|1-n||
00400002|ScheduledProcedureStepStartDate|Scheduled Procedure Step Start Date|DA|1||
00400003|ScheduledProcedureStepStartTime|Scheduled Procedure Step Start Time|TM|1||
00400004|ScheduledProcedureStepEndDate|Scheduled Procedure Step End Date|DA|1||
00400005|ScheduledProcedureStepEndTime|Scheduled Procedure Step End Time|TM|1||
00400006|ScheduledPerformingPhysicianName|Scheduled Performing Physician's Name|PN|1||
00400007|ScheduledProcedureStepDescription|Scheduled Procedure Step Description|LO|1||
00400008|ScheduledProtocolCodeSequence|Scheduled Protocol Code Sequence|SQ|1||
00400009|ScheduledProcedureStepID|Scheduled Procedure Step ID|SH|1||
0040000A|StageCodeSequence|Stage Code Sequence|SQ|1||
0040000B|ScheduledPerformingPhysicianIdentificationSequence|Scheduled Performing Physician Identification Sequence|SQ|1||
00400010|ScheduledStationName|Scheduled Station Name|SH|1-n||
00400011|ScheduledProcedureStepLocation|Scheduled Procedure Step Location|SH|1||
00400012|PreMedication|Pre-Medication|LO|1||
00400020|ScheduledProcedureStepStatus|Scheduled Procedure Step Status|CS|1||
00400026|OrderPlacerIdentifierSequence|Order Placer Identifier Sequence|SQ|1||
00400027|OrderFillerIdentifierSequence|Order Filler Identifier Sequence|SQ|1||
00400031|LocalNamespaceEntityID|Local Namespace Entity ID|UT|1||
00400032|UniversalEntityID|Universal Entity ID|UT|1||
00400033|UniversalEntityIDType|Universal Entity ID Type|CS|1||
00400035|IdentifierTypeCode|Identifier Type Code|CS|1||
00400036|AssigningFacilitySequence|Assigning Facility Sequence|SQ|1||
00400039|AssigningJurisdictionCodeSequence|Assigning Jurisdiction Code Sequence|SQ|1||
0040003A|AssigningAgencyOrDepartmentCodeSequence|Assigning Agency or Department Code Sequence|SQ|1||
00400100|ScheduledProcedureStepSequence|Scheduled Procedure Step Sequence|SQ|1||
00400220|ReferencedNonImageCompositeSOPInstanceSequence|Referenced Non-Image Composite SOP Instance Sequence|SQ|1||
00400241|PerformedStationAETitle|Performed Station AE Title|AE|1||
00400242|PerformedStationName|Performed Station Name|SH|1||
00400243|PerformedLocation|Performed Location|SH|1||
00400244|PerformedProcedureStepStartDate|Performed Procedure Step Start Date|DA|1||
00400245|PerformedProcedureStepStartTime|Performed Procedure Step Start Time|TM|1||
00400250|PerformedProcedureStepEndDate|Performed Procedure Step End Date|DA|1||
00400251|PerformedProcedureStepEndTime|Performed Procedure Step End Time|TM|1||
00400252|PerformedProcedureStepStatus|Performed Procedure Step Status|CS|1||
00400253|PerformedProcedureStepID|Performed Procedure Step ID|SH|1||
00400254|PerformedProcedureStepDescription|Performed Procedure Step Description|LO|1||
00400255|PerformedProcedureTypeDescription|Performed Procedure Type Description|LO|1||
00400260|PerformedProtocolCodeSequence|Performed Protocol Code Sequence|SQ|1||
00400261|PerformedProtocolType|Performed Protocol Type|CS|1||
00400270|ScheduledStepAttributesSequence|Scheduled Step Attributes Sequence|SQ|1||
00400275|RequestAttributesSequence|Request Attributes Sequence|SQ|1||
00400280|CommentsOnThePerformedProcedureStep|Comments on the Performed Procedure Step|ST|1||
00400281|PerformedProcedureStepDiscontinuationReasonCodeSequence|Performed Procedure Step Discontinuation Reason Code Sequence|SQ|1||
00400293|QuantitySequence|Quantity Sequence|SQ|1||
00400294|Quantity|Quantity|DS|1||
00400295|MeasuringUnitsSequence|Measuring Units Sequence|SQ|1||
00400296|BillingItemSequence|Billing Item Sequence|SQ|1||
00400300|TotalTimeOfFluoroscopy|Total Time of Fluoroscopy|US|1|R|
00400301|TotalNumberOfExposures|Total Number of Exposures|US|1|R|
00400302|EntranceDose|Entrance Dose|US|1||
00400303|ExposedArea|Exposed Area|US|1-2||
00400306|DistanceSourceToEntrance|Distance Source to Entrance|DS|1||
00400307|DistanceSourceToSupport|Distance Source to Support|DS|1|R|
0040030E|ExposureDoseSequence|Exposure Dose Sequence|SQ|1|R|
00400310|CommentsOnRadiationDose|Comments on Radiation Dose|ST|1||
00400312|XRayOutput|X-Ray Output|DS|1||
00400314|HalfValueLayer|Half Value Layer|DS|1||
00400316|OrganDose|Organ Dose|DS|1||
00400318|OrganExposed|Organ Exposed|CS|1||
00400320|BillingProcedureStepSequence|Billing Procedure Step Sequence|SQ|1||
00400321|FilmConsumptionSequence|Film Consumption Sequence|SQ|1||
00400324|BillingSuppliesAndDevicesSequence|Billing Supplies and Devices Sequence|SQ|1||
00400330|ReferencedProcedureStepSequence|Referenced Procedure Step Sequence|SQ|1|R|
00400340|PerformedSeriesSequence|Performed Series Sequence|SQ|1||
00400400|CommentsOnTheScheduledProcedureStep|Comments on the Scheduled Procedure Step|LT|1||
00400440|ProtocolContextSequence|Protocol Context Sequence|SQ|1||
00400441|ContentItemModifierSequence|Content Item Modifier Sequence|SQ|1||
00400500|ScheduledSpecimenSequence|Scheduled Specimen Sequence|SQ|1||
0040050A|SpecimenAccessionNumber|Specimen Accession Number|LO|1|R|
00400512|ContainerIdentifier|Container Identifier|LO|1||
00400513|IssuerOfTheContainerIdentifierSequence|Issuer of the Container Identifier Sequence|SQ|1||
00400515|AlternateContainerIdentifierSequence|Alternate Container Identifier Sequence|SQ|1||
00400518|ContainerTypeCodeSequence|Container Type Code Sequence|SQ|1||
0040051A|ContainerDescription|Container Description|LO|1||
00400520|ContainerComponentSequence|Container Component Sequence|SQ|1||
00400550|SpecimenSequence|Specimen Sequence|SQ|1|R|
00400551|SpecimenIdentifier|Specimen Identifier|LO|1||
00400552|SpecimenDescriptionSequenceTrial|Specimen Description Sequence (Trial)|SQ|1|R|
00400553|SpecimenDescriptionTrial|Specimen Description (Trial)|ST|1|R|
00400554|SpecimenUID|Specimen UID|UI|1||
00400555|AcquisitionContextSequence|Acquisition Context Sequence|SQ|1||
00400556|AcquisitionContextDescription|Acquisition Context Description|ST|1||
00400560|SpecimenDescriptionSequence|Specimen Description Sequence|SQ|1||
00400562|IssuerOfTheSpecimenIdentifierSequence|Issuer of the Specimen Identifier Sequence|SQ|1||
0040059A|SpecimenTypeCodeSequence|Specimen Type Code Sequence|SQ|1||
00400600|SpecimenShortDescription|Specimen Short Description|LO|1||
00400602|SpecimenDetailedDescription|Specimen Detailed Description|UT|1||
00400610|SpecimenPreparationSequence|Specimen Preparation Sequence|SQ|1||
00400612|SpecimenPreparationStepContentItemSequence|Specimen Preparation Step Content Item Sequence|SQ|1||
00400620|SpecimenLocalizationContentItemSequence|Specimen Localization Content Item Sequence|SQ|1||
004006FA|SlideIdentifier|Slide Identifier|LO|1|R|
00400710|WholeSlideMicroscopyImageFrameTypeSequence|Whole Slide Microscopy Image Frame Type Sequence|SQ|1||
0040071A|ImageCenterPointCoordinatesSequence|Image Center Point Coordinates Sequence|SQ|1||
0040072A|XOffsetInSlideCoordinateSystem|X Offset in Slide Coordinate System|DS|1||
0040073A|YOffsetInSlideCoordinateSystem|Y Offset in Slide Coordinate System|DS|1||
0040074A|ZOffsetInSlideCoordinateSystem|Z Offset in Slide Coordinate System|DS|1||
004008D8|PixelSpacingSequence|Pixel Spacing Sequence|SQ|1|R|
004008DA|CoordinateSystemAxisCodeSequence|Coordinate System Axis Code Sequence|SQ|1|R|
004008EA|MeasurementUnitsCodeSequence|Measurement Units Code Sequence|SQ|1||
004009F8|VitalStainCodeSequenceTrial|Vital Stain Code Sequence (Trial)|SQ|1|R|
00401001|RequestedProcedureID|Requested Procedure ID|SH|1||
00401002|ReasonForTheRequestedProcedure|Reason for the Requested Procedure|LO|1||
00401003|RequestedProcedurePriority|Requested Procedure Priority|SH|1||
00401004|PatientTransportArrangements|Patient Transport Arrangements|LO|1||
00401005|RequestedProcedureLocation|Requested Procedure Location|LO|1||
00401006|PlacerOrderNumberProcedure|Placer Order Number / Procedure|SH|1|R|
00401007|FillerOrderNumberProcedure|Filler Order Number / Procedure|SH|1|R|
00401008|ConfidentialityCode|Confidentiality Code|LO|1||
00401009|ReportingPriority|Reporting Priority|SH|1||
0040100A|ReasonForRequestedProcedureCodeSequence|Reason for Requested Procedure Code Sequence|SQ|1||
00401010|NamesOfIntendedRecipientsOfResults|Names of Intended Recipients of Results|PN|1-n||
00401011|IntendedRecipientsOfResultsIdentificationSequence|Intended Recipients of Results Identification Sequence|SQ|1||
00401012|ReasonForPerformedProcedureCodeSequence|Reason For Performed Procedure Code Sequence|SQ|1||
00401060|RequestedProcedureDescriptionTrial|Requested Procedure Description (Trial)|LO|1|R|
00401101|PersonIdentificationCodeSequence|Person Identification Code Sequence|SQ|1||
00401102|PersonAddress|Person's Address|ST|1||
00401103|PersonTelephoneNumbers|Person's Telephone Numbers|LO|1-n||
00401104|PersonTelecomInformation|Person's Telecom Information|LT|1||
00401400|RequestedProcedureComments|Requested Procedure Comments|LT|1||
00402001|ReasonForTheImagingServiceRequest|Reason for the Imaging Service Request|LO|1|R|
00402004|IssueDateOfImagingServiceRequest|Issue Date of Imaging Service Request|DA|1||
00402005|IssueTimeOfImagingServiceRequest|Issue Time of Imaging Service Request|TM|1||
00402006|PlacerOrderNumberImagingServiceRequestRetired|Placer Order Number / Imaging Service Request (Retired)|SH|1|R|
00402007|FillerOrderNumberImagingServiceRequestRetired|Filler Order Number / Imaging Service Request (Retired)|SH|1|R|
00402008|OrderEnteredBy|Order Entered By|PN|1||
00402009|OrderEntererLocation|Order Enterer's Location|SH|1||
00402010|OrderCallbackPhoneNumber|Order Callback Phone Number|SH|1||
00402011|OrderCallbackTelecomInformation|Order Callback Telecom Information|LT|1||
00402016|PlacerOrderNumberImagingServiceRequest|Placer Order Number / Imaging Service Request|LO|1||
00402017|FillerOrderNumberImagingServiceRequest|Filler Order Number / Imaging Service Request|LO|1||
00402400|ImagingServiceRequestComments|Imaging Service Request Comments|LT|1||
00403001|ConfidentialityConstraintOnPatientDataDescription|Confidentiality Constraint on Patient Data Description|LO|1||
00404001|GeneralPurposeScheduledProcedureStepStatus|General Purpose Scheduled Procedure Step Status|CS|1|R|
00404002|GeneralPurposePerformedProcedureStepStatus|General Purpose Performed Procedure Step Status|CS|1|R|
00404003|GeneralPurposeScheduledProcedureStepPriority|General Purpose Scheduled Procedure Step Priority|CS|1|R|
00404004|ScheduledProcessingApplicationsCodeSequence|Scheduled Processing Applications Code Sequence|SQ|1|R|
00404005|ScheduledProcedureStepStartDateTime|Scheduled Procedure Step Start DateTime|DT|1||
00404006|MultipleCopiesFlag|Multiple Copies Flag|CS|1|R|
00404007|PerformedProcessingApplicationsCodeSequence|Performed Processing Applications Code Sequence|SQ|1|R|
00404008|ScheduledProcedureStepExpirationDateTime|Scheduled Procedure Step Expiration DateTime|DT|1||
00404009|HumanPerformerCodeSequence|Human Performer Code Sequence|SQ|1||
00404010|ScheduledProcedureStepModificationDateTime|Scheduled Procedure Step Modification DateTime|DT|1||
00404011|ExpectedCompletionDateTime|Expected Completion DateTime|DT|1||
00404015|ResultingGeneralPurposePerformedProcedureStepsSequence|Resulting General Purpose Performed Procedure Steps Sequence|SQ|1|R|
00404016|ReferencedGeneralPurposeScheduledProcedureStepSequence|Referenced General Purpose Scheduled Procedure Step Sequence|SQ|1|R|
00404018|ScheduledWorkitemCodeSequence|Scheduled Workitem Code Sequence|SQ|1||
00404019|PerformedWorkitemCodeSequence|Performed Workitem Code Sequence|SQ|1||
00404020|InputAvailabilityFlag|Input Availability Flag|CS|1|R|
00404021|InputInformationSequence|Input Information Sequence|SQ|1||
00404022|RelevantInformationSequence|Relevant Information Sequence|SQ|1|R|
00404023|ReferencedGeneralPurposeScheduledProcedureStepTransactionUID|Referenced General Purpose Scheduled Procedure Step Transaction UID|UI|1|R|
00404025|ScheduledStationNameCodeSequence|Scheduled Station Name Code Sequence|SQ|1||
00404026|ScheduledStationClassCodeSequence|Scheduled Station Class Code Sequence|SQ|1||
00404027|ScheduledStationGeographicLocationCodeSequence|Scheduled Station Geographic Location Code Sequence|SQ|1||
00404028|PerformedStationNameCodeSequence|Performed Station Name Code Sequence|SQ|1||
00404029|PerformedStationClassCodeSequence|Performed Station Class Code Sequence|SQ|1||
00404030|PerformedStationGeographicLocationCodeSequence|Performed Station Geographic Location Code Sequence|SQ|1||
00404031|RequestedSubsequentWorkitemCodeSequence|Requested Subsequent Workitem Code Sequence|SQ|1|R|
00404032|NonDICOMOutputCodeSequence|Non-DICOM Output Code Sequence|SQ|1|R|
00404033|OutputInformationSequence|Output Information Sequence|SQ|1||
00404034|ScheduledHumanPerformersSequence|Scheduled Human Performers Sequence|SQ|1||
00404035|ActualHumanPerformersSequence|Actual Human Performers Sequence|SQ|1||
00404036|HumanPerformerOrganization|Human Performer's Organization|LO|1||
00404037|HumanPerformerName|Human Performer's Name|PN|1||
00404040|RawDataHandling|Raw Data Handling|CS|1||
00404041|InputReadinessState|Input Readiness State|CS|1||
00404050|PerformedProcedureStepStartDateTime|Performed Procedure Step Start DateTime|DT|1||
00404051|PerformedProcedureStepEndDateTime|Performed Procedure Step End DateTime|DT|1||
00404052|ProcedureStepCancellationDateTime|Procedure Step Cancellation DateTime|DT|1||
00404070|OutputDestinationSequence|Output Destination Sequence|SQ|1||
00404071|DICOMStorageSequence|DICOM Storage Sequence|SQ|1||
00404072|STOWRSStorageSequence|STOW-RS Storage Sequence|SQ|1||
00404073|StorageURL|Storage URL|UR|1||
00404074|XDSStorageSequence|XDS Storage Sequence|SQ|1||
00408302|EntranceDoseInmGy|Entrance Dose in mGy|DS|1||
00408303|EntranceDoseDerivation|Entrance Dose Derivation|CS|1||
00409092|ParametricMapFrameTypeSequence|Parametric Map Frame Type Sequence|SQ|1||
00409094|ReferencedImageRealWorldValueMappingSequence|Referenced Image Real World Value Mapping Sequence|SQ|1||
00409096|RealWorldValueMappingSequence|Real World Value Mapping Sequence|SQ|1||
00409098|PixelValueMappingCodeSequence|Pixel Value Mapping Code Sequence|SQ|1||
00409210|LUTLabel|LUT Label|SH|1||
00409211|RealWorldValueLastValueMapped|Real World Value Last Value Mapped|US/SS|1||
00409212|RealWorldValueLUTData|Real World Value LUT Data|FD|1-n||
00409213|DoubleFloatRealWorldValueLastValueMapped|Double Float Real World Value Last Value Mapped|FD|1||
00409214|DoubleFloatRealWorldValueFirstValueMapped|Double Float Real World Value First Value Mapped|FD|1||
00409216|RealWorldValueFirstValueMapped|Real World Value First Value Mapped|US/SS|1||
00409220|QuantityDefinitionSequence|Quantity Definition Sequence|SQ|1||
00409224|RealWorldValueIntercept|Real World Value Intercept|FD|1||
00409225|RealWorldValueSlope|Real World Value Slope|FD|1||
0040A007|FindingsFlagTrial|Findings Flag (Trial)|CS|1|R|
0040A010|RelationshipType|Relationship Type|CS|1||
0040A020|FindingsSequenceTrial|Findings Sequence (Trial)|SQ|1|R|
0040A021|FindingsGroupUIDTrial|Findings Group UID (Trial)|UI|1|R|
0040A022|ReferencedFindingsGroupUIDTrial|Referenced Findings Group UID (Trial)|UI|1|R|
0040A023|FindingsGroupRecordingDateTrial|Findings Group Recording Date (Trial)|DA|1|R|
0040A024|FindingsGroupRecordingTimeTrial|Findings Group Recording Time (Trial)|TM|1|R|
0040A026|FindingsSourceCategoryCodeSequenceTrial|Findings Source Category Code Sequence (Trial)|SQ|1|R|
0040A027|VerifyingOrganization|Verifying Organization|LO|1||
0040A028|DocumentingOrganizationIdentifierCodeSequenceTrial|Documenting Organization Identifier Code Sequence (Trial)|SQ|1|R|
0040A030|VerificationDateTime|Verification DateTime|DT|1||
0040A032|ObservationDateTime|Observation DateTime|DT|1||
0040A033|ObservationStartDateTime|Observation Start DateTime|DT|1||
0040A034|EffectiveStartDateTime|Effective Start DateTime|DT|1||
0040A035|EffectiveStopDateTime|Effective Stop DateTime|DT|1||
0040A040|ValueType|Value Type|CS|1||
0040A043|ConceptNameCodeSequence|Concept Name Code Sequence|SQ|1||
0040A047|MeasurementPrecisionDescriptionTrial|Measurement Precision Description (Trial)|LO|1|R|
0040A050|ContinuityOfContent|Continuity Of Content|CS|1||
0040A057|UrgencyOrPriorityAlertsTrial|Urgency or Priority Alerts (Trial)|CS|1-n|R|
0040A060|SequencingIndicatorTrial|Sequencing Indicator (Trial)|LO|1|R|
0040A066|DocumentIdentifierCodeSequenceTrial|Document Identifier Code Sequence (Trial)|SQ|1|R|
0040A067|DocumentAuthorTrial|Document Author (Trial)|PN|1|R|
0040A068|DocumentAuthorIdentifierCodeSequenceTrial|Document Author Identifier Code Sequence (Trial)|SQ|1|R|
0040A070|IdentifierCodeSequenceTrial|Identifier Code Sequence (Trial)|SQ|1|R|
0040A073|VerifyingObserverSequence|Verifying Observer Sequence|SQ|1||
0040A074|ObjectBinaryIdentifierTrial|Object Binary Identifier (Trial)|OB|1|R|
0040A075|VerifyingObserverName|Verifying Observer Name|PN|1||
0040A076|DocumentingObserverIdentifierCodeSequenceTrial|Documenting Observer Identifier Code Sequence (Trial)|SQ|1|R|
0040A078|AuthorObserverSequence|Author Observer Sequence|SQ|1||
0040A07A|ParticipantSequence|Participant Sequence|SQ|1||
0040A07C|CustodialOrganizationSequence|Custodial Organization Sequence|SQ|1||
0040A080|ParticipationType|Participation Type|CS|1||
0040A082|ParticipationDateTime|Participation DateTime|DT|1||
0040A084|ObserverType|Observer Type|CS|1||
0040A085|ProcedureIdentifierCodeSequenceTrial|Procedure Identifier Code Sequence (Trial)|SQ|1|R|
0040A088|VerifyingObserverIdentificationCodeSequence|Verifying Observer Identification Code Sequence|SQ|1||
0040A089|ObjectDirectoryBinaryIdentifierTrial|Object Directory Binary Identifier (Trial)|OB|1|R|
0040A090|EquivalentCDADocumentSequence|Equivalent CDA Document Sequence|SQ|1|R|
0040A0B0|ReferencedWaveformChannels|Referenced Waveform Channels|US|2-2n||
0040A110|DateOfDocumentOrVerbalTransactionTrial|Date of Document or Verbal Transaction (Trial)|DA|1|R|
0040A112|TimeOfDocumentCreationOrVerbalTransactionTrial|Time of Document Creation or Verbal Transaction (Trial)|TM|1|R|
0040A120|DateTime|DateTime|DT|1||
0040A121|Date|Date|DA|1||
0040A122|Time|Time|TM|1||
0040A123|PersonName|Person Name|PN|1||
0040A124|UID|UID|UI|1||
0040A125|ReportStatusIDTrial|Report Status ID (Trial)|CS|2|R|
0040A130|TemporalRangeType|Temporal Range Type|CS|1||
0040A132|ReferencedSamplePositions|Referenced Sample Positions|UL|1-n||
0040A136|ReferencedFrameNumbers|Referenced Frame Numbers|US|1-n|R|
0040A138|ReferencedTimeOffsets|Referenced Time Offsets|DS|1-n||
0040A13A|ReferencedDateTime|Referenced DateTime|DT|1-n||
0040A160|TextValue|Text Value|UT|1||
0040A161|FloatingPointValue|Floating Point Value|FD|1-n||
0040A162|RationalNumeratorValue|Rational Numerator Value|SL|1-n||
0040A163|RationalDenominatorValue|Rational Denominator Value|UL|1-n||
0040A167|ObservationCategoryCodeSequenceTrial|Observation Category Code Sequence (Trial)|SQ|1|R|
0040A168|ConceptCodeSequence|Concept Code Sequence|SQ|1||
0040A16A|BibliographicCitationTrial|Bibliographic Citation (Trial)|ST|1|R|
0040A170|PurposeOfReferenceCodeSequence|Purpose of Reference Code Sequence|SQ|1||
0040A171|ObservationUID|Observation UID|UI|1||
0040A172|ReferencedObservationUIDTrial|Referenced Observation UID (Trial)|UI|1|R|
0040A173|ReferencedObservationClassTrial|Referenced Observation Class (Trial)|CS|1|R|
0040A174|ReferencedObjectObservationClassTrial|Referenced Object Observation Class (Trial)|CS|1|R|
0040A180|AnnotationGroupNumber|Annotation Group Number|US|1||
0040A192|ObservationDateTrial|Observation Date (Trial)|DA|1|R|
0040A193|ObservationTimeTrial|Observation Time (Trial)|TM|1|R|
0040A194|MeasurementAutomationTrial|Measurement Automation (Trial)|CS|1|R|
0040A195|ModifierCodeSequence|Modifier Code Sequence|SQ|1||
0040A224|IdentificationDescriptionTrial|Identification Description (Trial)|ST|1|R|
0040A290|CoordinatesSetGeometricTypeTrial|Coordinates Set Geometric Type (Trial)|CS|1|R|
0040A296|AlgorithmCodeSequenceTrial|Algorithm Code Sequence (Trial)|SQ|1|R|
0040A297|AlgorithmDescriptionTrial|Algorithm Description (Trial)|ST|1|R|
0040A29A|PixelCoordinatesSetTrial|Pixel Coordinates Set (Trial)|SL|2-2n|R|
0040A300|MeasuredValueSequence|Measured Value Sequence|SQ|1||
0040A301|NumericValueQualifierCodeSequence|Numeric Value Qualifier Code Sequence|SQ|1||
0040A307|CurrentObserverTrial|Current Observer (Trial)|PN|1|R|
0040A30A|NumericValue|Numeric Value|DS|1-n||
0040A313|ReferencedAccessionSequenceTrial|Referenced Accession Sequence (Trial)|SQ|1|R|
0040A33A|ReportStatusCommentTrial|Report Status Comment (Trial)|ST|1|R|
0040A340|ProcedureContextSequenceTrial|Procedure Context Sequence (Trial)|SQ|1|R|
0040A352|VerbalSourceTrial|Verbal Source (Trial)|PN|1|R|
0040A353|AddressTrial|Address (Trial)|ST|1|R|
0040A354|TelephoneNumberTrial|Telephone Number (Trial)|LO|1|R|
0040A358|VerbalSourceIdentifierCodeSequenceTrial|Verbal Source Identifier Code Sequence (Trial)|SQ|1|R|
0040A360|PredecessorDocumentsSequence|Predecessor Documents Sequence|SQ|1||
0040A370|ReferencedRequestSequence|Referenced Request Sequence|SQ|1||
0040A372|PerformedProcedureCodeSequence|Performed Procedure Code Sequence|SQ|1||
0040A375|CurrentRequestedProcedureEvidenceSequence|Current Requested Procedure Evidence Sequence|SQ|1||
0040A380|ReportDetailSequenceTrial|Report Detail Sequence (Trial)|SQ|1|R|
0040A385|PertinentOtherEvidenceSequence|Pertinent Other Evidence Sequence|SQ|1||
0040A390|HL7StructuredDocumentReferenceSequence|HL7 Structured Document Reference Sequence|SQ|1||
0040A402|ObservationSubjectUIDTrial|Observation Subject UID (Trial)|UI|1|R|
0040A403|ObservationSubjectClassTrial|Observation Subject Class (Trial)|CS|1|R|
0040A404|ObservationSubjectTypeCodeSequenceTrial|Observation Subject Type Code Sequence (Trial)|SQ|1|R|
0040A491|CompletionFlag|Completion Flag|CS|1||
0040A492|CompletionFlagDescription|Completion Flag Description|LO|1||
0040A493|VerificationFlag|Verification Flag|CS|1||
0040A494|ArchiveRequested|Archive Requested|CS|1||
0040A496|PreliminaryFlag|Preliminary Flag|CS|1||
0040A504|ContentTemplateSequence|Content Template Sequence|SQ|1||
0040A525|IdenticalDocumentsSequence|Identical Documents Sequence|SQ|1||
0040A600|ObservationSubjectContextFlagTrial|Observation Subject Context Flag (Trial)|CS|1|R|
0040A601|ObserverContextFlagTrial|Observer Context Flag (Trial)|CS|1|R|
0040A603|ProcedureContextFlagTrial|Procedure Context Flag (Trial)|CS|1|R|
0040A730|ContentSequence|Content Sequence|SQ|1||
0040A731|RelationshipSequenceTrial|Relationship Sequence (Trial)|SQ|1|R|
0040A732|RelationshipTypeCodeSequenceTrial|Relationship Type Code Sequence (Trial)|SQ|1|R|
0040A744|LanguageCodeSequenceTrial|Language Code Sequence (Trial)|SQ|1|R|
0040A801|TabulatedValuesSequence|Tabulated Values Sequence|SQ|1||
0040A802|NumberOfTableRows|Number of Table Rows|UL|1||
0040A803|NumberOfTableColumns|Number of Table Columns|UL|1||
0040A804|TableRowNumber|Table Row Number|UL|1||
0040A805|TableColumnNumber|Table Column Number|UL|1||
0040A806|TableRowDefinitionSequence|Table Row Definition Sequence|SQ|1||
0040A807|TableColumnDefinitionSequence|Table Column Definition Sequence|SQ|1||
0040A808|CellValuesSequence|Cell Values Sequence|SQ|1||
0040A992|UniformResourceLocatorTrial|Uniform Resource Locator (Trial)|ST|1|R|
0040B020|WaveformAnnotationSequence|Waveform Annotation Sequence|SQ|1||
0040B030|StructuredWaveformAnnotationSequence|Structured Waveform Annotation Sequence|SQ|1||
0040B031|WaveformAnnotationDisplaySelectionSequence|Waveform Annotation Display Selection Sequence|SQ|1||
0040B032|ReferencedMontageIndex|Referenced Montage Index|US|1||
0040B033|WaveformTextualAnnotationSequence|Waveform Textual Annotation Sequence|SQ|1||
0040B034|AnnotationDateTime|Annotation DateTime|DT|1||
0040B035|DisplayedWaveformSegmentSequence|Displayed Waveform Segment Sequence|SQ|1||
0040B036|SegmentDefinitionDateTime|Segment Definition DateTime|DT|1||
0040B037|MontageActivationSequence|Montage Activation Sequence|SQ|1||
0040B038|MontageActivationTimeOffset|Montage Activation Time Offset|DS|1||
0040B039|WaveformMontageSequence|Waveform Montage Sequence|SQ|1||
0040B03A|ReferencedMontageChannelNumber|Referenced Montage Channel Number|IS|1||
0040B03B|MontageName|Montage Name|LT|1||
0040B03C|MontageChannelSequence|Montage Channel Sequence|SQ|1||
0040B03D|MontageIndex|Montage Index|US|1||
0040B03E|MontageChannelNumber|Montage Channel Number|IS|1||
0040B03F|MontageChannelLabel|Montage Channel Label|LO|1||
0040B040|MontageChannelSourceCodeSequence|Montage Channel Source Code Sequence|SQ|1||
0040B041|ContributingChannelSourcesSequence|Contributing Channel Sources Sequence|SQ|1||
0040B042|ChannelWeight|Channel Weight|FL|1||
0040DB00|TemplateIdentifier|Template Identifier|CS|1||
0040DB06|TemplateVersion|Template Version|DT|1|R|
0040DB07|TemplateLocalVersion|Template Local Version|DT|1|R|
0040DB0B|TemplateExtensionFlag|Template Extension Flag|CS|1|R|
0040DB0C|TemplateExtensionOrganizationUID|Template Extension Organization UID|UI|1|R|
0040DB0D|TemplateExtensionCreatorUID|Template Extension Creator UID|UI|1|R|
0040DB73|ReferencedContentItemIdentifier|Referenced Content Item Identifier|UL|1-n||
0040E001|HL7InstanceIdentifier|HL7 Instance Identifier|ST|1||
0040E004|HL7DocumentEffectiveTime|HL7 Document Effective Time|DT|1||
0040E006|HL7DocumentTypeCodeSequence|HL7 Document Type Code Sequence|SQ|1||
0040E008|DocumentClassCodeSequence|Document Class Code Sequence|SQ|1||
0040E010|RetrieveURI|Retrieve URI|UR|1||
0040E011|RetrieveLocationUID|Retrieve Location UID|UI|1||
0040E012|DisplayURI|Display URI|UR|1||
0040E020|TypeOfInstances|Type of Instances|CS|1||
0040E021|DICOMRetrievalSequence|DICOM Retrieval Sequence|SQ|1||
0040E022|DICOMMediaRetrievalSequence|DICOM Media Retrieval Sequence|SQ|1||
0040E023|WADORetrievalSequence|WADO Retrieval Sequence|SQ|1||
0040E024|XDSRetrievalSequence|XDS Retrieval Sequence|SQ|1||
0040E025|WADORSRetrievalSequence|WADO-RS Retrieval Sequence|SQ|1||
0040E030|RepositoryUniqueID|Repository Unique ID|UI|1||
0040E031|HomeCommunityID|Home Community ID|UI|1||
00420010|DocumentTitle|Document Title|ST|1||
00420011|EncapsulatedDocument|Encapsulated Document|OB|1||
00420012|MIMETypeOfEncapsulatedDocument|MIME Type of Encapsulated Document|LO|1||
00420013|SourceInstanceSequence|Source Instance Sequence|SQ|1||
00420014|ListOfMIMETypes|List of MIME Types|LO|1-n||
00420015|EncapsulatedDocumentLength|Encapsulated Document Length|UL|1||
00440001|ProductPackageIdentifier|Product Package Identifier|ST|1||
00440002|SubstanceAdministrationApproval|Substance Administration Approval|CS|1||
00440003|ApprovalStatusFurtherDescription|Approval Status Further Description|LT|1||
00440004|ApprovalStatusDateTime|Approval Status DateTime|DT|1||
00440007|ProductTypeCodeSequence|Product Type Code Sequence|SQ|1||
00440008|ProductName|Product Name|LO|1-n||
00440009|ProductDescription|Product Description|LT|1||
0044000A|ProductLotIdentifier|Product Lot Identifier|LO|1||
0044000B|ProductExpirationDateTime|Product Expiration DateTime|DT|1||
00440010|SubstanceAdministrationDateTime|Substance Administration DateTime|DT|1||
00440011|SubstanceAdministrationNotes|Substance Administration Notes|LO|1||
00440012|SubstanceAdministrationDeviceID|Substance Administration Device ID|LO|1||
00440013|ProductParameterSequence|Product Parameter Sequence|SQ|1||
00440019|SubstanceAdministrationParameterSequence|Substance Administration Parameter Sequence|SQ|1||
00440100|ApprovalSequence|Approval Sequence|SQ|1||
00440101|AssertionCodeSequence|Assertion Code Sequence|SQ|1||
00440102|AssertionUID|Assertion UID|UI|1||
00440103|AsserterIdentificationSequence|Asserter Identification Sequence|SQ|1||
00440104|AssertionDateTime|Assertion DateTime|DT|1||
00440105|AssertionExpirationDateTime|Assertion Expiration DateTime|DT|1||
00440106|AssertionComments|Assertion Comments|UT|1||
00440107|RelatedAssertionSequence|Related Assertion Sequence|SQ|1||
00440108|ReferencedAssertionUID|Referenced Assertion UID|UI|1||
00440109|ApprovalSubjectSequence|Approval Subject Sequence|SQ|1||
0044010A|OrganizationalRoleCodeSequence|Organizational Role Code Sequence|SQ|1||
00440110|RTAssertionsSequence|RT Assertions Sequence|SQ|1||
00460012|LensDescription|Lens Description|LO|1||
00460014|RightLensSequence|Right Lens Sequence|SQ|1||
00460015|LeftLensSequence|Left Lens Sequence|SQ|1||
00460016|UnspecifiedLateralityLensSequence|Unspecified Laterality Lens Sequence|SQ|1||
00460018|CylinderSequence|Cylinder Sequence|SQ|1||
00460028|PrismSequence|Prism Sequence|SQ|1||
00460030|HorizontalPrismPower|Horizontal Prism Power|FD|1||
00460032|HorizontalPrismBase|Horizontal Prism Base|CS|1||
00460034|VerticalPrismPower|Vertical Prism Power|FD|1||
00460036|VerticalPrismBase|Vertical Prism Base|CS|1||
00460038|LensSegmentType|Lens Segment Type|CS|1||
00460040|OpticalTransmittance|Optical Transmittance|FD|1||
00460042|ChannelWidth|Channel Width|FD|1||
00460044|PupilSize|Pupil Size|FD|1||
00460046|CornealSize|Corneal Size|FD|1||
00460047|CornealSizeSequence|Corneal Size Sequence|SQ|1||
00460050|AutorefractionRightEyeSequence|Autorefraction Right Eye Sequence|SQ|1||
00460052|AutorefractionLeftEyeSequence|Autorefraction Left Eye Sequence|SQ|1||
00460060|DistancePupillaryDistance|Distance Pupillary Distance|FD|1||
00460062|NearPupillaryDistance|Near Pupillary Distance|FD|1||
00460063|IntermediatePupillaryDistance|Intermediate Pupillary Distance|FD|1||
00460064|OtherPupillaryDistance|Other Pupillary Distance|FD|1||
00460070|KeratometryRightEyeSequence|Keratometry Right Eye Sequence|SQ|1||
00460071|KeratometryLeftEyeSequence|Keratometry Left Eye Sequence|SQ|1||
00460074|SteepKeratometricAxisSequence|Steep Keratometric Axis Sequence|SQ|1||
00460075|RadiusOfCurvature|Radius of Curvature|FD|1||
00460076|KeratometricPower|Keratometric Power|FD|1||
00460077|KeratometricAxis|Keratometric Axis|FD|1||
00460080|FlatKeratometricAxisSequence|Flat Keratometric Axis Sequence|SQ|1||
00460092|BackgroundColor|Background Color|CS|1||
00460094|Optotype|Optotype|CS|1||
00460095|OptotypePresentation|Optotype Presentation|CS|1||
00460097|SubjectiveRefractionRightEyeSequence|Subjective Refraction Right Eye Sequence|SQ|1||
00460098|SubjectiveRefractionLeftEyeSequence|Subjective Refraction Left Eye Sequence|SQ|1||
00460100|AddNearSequence|Add Near Sequence|SQ|1||
00460101|AddIntermediateSequence|Add Intermediate Sequence|SQ|1||
00460102|AddOtherSequence|Add Other Sequence|SQ|1||
00460104|AddPower|Add Power|FD|1||
00460106|ViewingDistance|Viewing Distance|FD|1||
00460110|CorneaMeasurementsSequence|Cornea Measurements Sequence|SQ|1||
00460111|SourceOfCorneaMeasurementDataCodeSequence|Source of Cornea Measurement Data Code Sequence|SQ|1||
00460112|SteepCornealAxisSequence|Steep Corneal Axis Sequence|SQ|1||
00460113|FlatCornealAxisSequence|Flat Corneal Axis Sequence|SQ|1||
00460114|CornealPower|Corneal Power|FD|1||
00460115|CornealAxis|Corneal Axis|FD|1||
00460116|CorneaMeasurementMethodCodeSequence|Cornea Measurement Method Code Sequence|SQ|1||
00460117|RefractiveIndexOfCornea|Refractive Index of Cornea|FL|1||
00460118|RefractiveIndexOfAqueousHumor|Refractive Index of Aqueous Humor|FL|1||
00460121|VisualAcuityTypeCodeSequence|Visual Acuity Type Code Sequence|SQ|1||
00460122|VisualAcuityRightEyeSequence|Visual Acuity Right Eye Sequence|SQ|1||
00460123|VisualAcuityLeftEyeSequence|Visual Acuity Left Eye Sequence|SQ|1||
00460124|VisualAcuityBothEyesOpenSequence|Visual Acuity Both Eyes Open Sequence|SQ|1||
00460125|ViewingDistanceType|Viewing Distance Type|CS|1||
00460135|VisualAcuityModifiers|Visual Acuity Modifiers|SS|2||
00460137|DecimalVisualAcuity|Decimal Visual Acuity|FD|1||
00460139|OptotypeDetailedDefinition|Optotype Detailed Definition|LO|1||
00460145|ReferencedRefractiveMeasurementsSequence|Referenced Refractive Measurements Sequence|SQ|1||
00460146|SpherePower|Sphere Power|FD|1||
00460147|CylinderPower|Cylinder Power|FD|1||
00460201|CornealTopographySurface|Corneal Topography Surface|CS|1||
00460202|CornealVertexLocation|Corneal Vertex Location|FL|2||
00460203|PupilCentroidXCoordinate|Pupil Centroid X-Coordinate|FL|1||
00460204|PupilCentroidYCoordinate|Pupil Centroid Y-Coordinate|FL|1||
00460205|EquivalentPupilRadius|Equivalent Pupil Radius|FL|1||
00460207|CornealTopographyMapTypeCodeSequence|Corneal Topography Map Type Code Sequence|SQ|1||
00460208|VerticesOfTheOutlineOfPupil|Vertices of the Outline of Pupil|IS|2-2n||
00460210|CornealTopographyMappingNormalsSequence|Corneal Topography Mapping Normals Sequence|SQ|1||
00460211|MaximumCornealCurvatureSequence|Maximum Corneal Curvature Sequence|SQ|1||
00460212|MaximumCornealCurvature|Maximum Corneal Curvature|FL|1||
00460213|MaximumCornealCurvatureLocation|Maximum Corneal Curvature Location|FL|2||
00460215|MinimumKeratometricSequence|Minimum Keratometric Sequence|SQ|1||
00460218|SimulatedKeratometricCylinderSequence|Simulated Keratometric Cylinder Sequence|SQ|1||
00460220|AverageCornealPower|Average Corneal Power|FL|1||
00460224|CornealISValue|Corneal I-S Value|FL|1||
00460227|AnalyzedArea|Analyzed Area|FL|1||
00460230|SurfaceRegularityIndex|Surface Regularity Index|FL|1||
00460232|SurfaceAsymmetryIndex|Surface Asymmetry Index|FL|1||
00460234|CornealEccentricityIndex|Corneal Eccentricity Index|FL|1||
00460236|KeratoconusPredictionIndex|Keratoconus Prediction Index|FL|1||
00460238|DecimalPotentialVisualAcuity|Decimal Potential Visual Acuity|FL|1||
00460242|CornealTopographyMapQualityEvaluation|Corneal Topography Map Quality Evaluation|CS|1||
00460244|SourceImageCornealProcessedDataSequence|Source Image Corneal Processed Data Sequence|SQ|1||
00460247|CornealPointLocation|Corneal Point Location|FL|3||
00460248|CornealPointEstimated|Corneal Point Estimated|CS|1||
00460249|AxialPower|Axial Power|FL|1||
00460250|TangentialPower|Tangential Power|FL|1||
00460251|RefractivePower|Refractive Power|FL|1||
00460252|RelativeElevation|Relative Elevation|FL|1||
00460253|CornealWavefront|Corneal Wavefront|FL|1||
00480001|ImagedVolumeWidth|Imaged Volume Width|FL|1||
00480002|ImagedVolumeHeight|Imaged Volume Height|FL|1||
00480003|ImagedVolumeDepth|Imaged Volume Depth|FL|1||
00480006|TotalPixelMatrixColumns|Total Pixel Matrix Columns|UL|1||
00480007|TotalPixelMatrixRows|Total Pixel Matrix Rows|UL|1||
00480008|TotalPixelMatrixOriginSequence|Total Pixel Matrix Origin Sequence|SQ|1||
00480010|SpecimenLabelInImage|Specimen Label in Image|CS|1||
00480011|FocusMethod|Focus Method|CS|1||
00480012|ExtendedDepthOfField|Extended Depth of Field|CS|1||
00480013|NumberOfFocalPlanes|Number of Focal Planes|US|1||
00480014|DistanceBetweenFocalPlanes|Distance Between Focal Planes|FL|1||
00480015|RecommendedAbsentPixelCIELabValue|Recommended Absent Pixel CIELab Value|US|3||
00480100|IlluminatorTypeCodeSequence|Illuminator Type Code Sequence|SQ|1||
00480102|ImageOrientationSlide|Image Orientation (Slide)|DS|6||
00480105|OpticalPathSequence|Optical Path Sequence|SQ|1||
00480106|OpticalPathIdentifier|Optical Path Identifier|SH|1||
00480107|OpticalPathDescription|Optical Path Description|ST|1||
00480108|IlluminationColorCodeSequence|Illumination Color Code Sequence|SQ|1||
00480110|SpecimenReferenceSequence|Specimen Reference Sequence|SQ|1||
00480111|CondenserLensPower|Condenser Lens Power|DS|1||
00480112|ObjectiveLensPower|Objective Lens Power|DS|1||
00480113|ObjectiveLensNumericalAperture|Objective Lens Numerical Aperture|DS|1||
00480114|ConfocalMode|Confocal Mode|CS|1||
00480115|TissueLocation|Tissue Location|CS|1||
00480116|ConfocalMicroscopyImageFrameTypeSequence|Confocal Microscopy Image Frame Type Sequence|SQ|1||
00480117|ImageAcquisitionDepth|Image Acquisition Depth|FD|1||
00480120|PaletteColorLookupTableSequence|Palette Color Lookup Table Sequence|SQ|1||
00480200|ReferencedImageNavigationSequence|Referenced Image Navigation Sequence|SQ|1|R|
00480201|TopLeftHandCornerOfLocalizerArea|Top Left Hand Corner of Localizer Area|US|2|R|
00480202|BottomRightHandCornerOfLocalizerArea|Bottom Right Hand Corner of Localizer Area|US|2|R|
00480207|OpticalPathIdentificationSequence|Optical Path Identification Sequence|SQ|1||
0048021A|PlanePositionSlideSequence|Plane Position (Slide) Sequence|SQ|1||
0048021E|ColumnPositionInTotalImagePixelMatrix|Column Position In Total Image Pixel Matrix|SL|1||
0048021F|RowPositionInTotalImagePixelMatrix|Row Position In Total Image Pixel Matrix|SL|1||
00480301|PixelOriginInterpretation|Pixel Origin Interpretation|CS|1||
00480302|NumberOfOpticalPaths|Number of Optical Paths|UL|1||
00480303|TotalPixelMatrixFocalPlanes|Total Pixel Matrix Focal Planes|UL|1||
00480304|TilesOverlap|Tiles Overlap|CS|1||
00500004|CalibrationImage|Calibration Image|CS|1||
00500010|DeviceSequence|Device Sequence|SQ|1||
00500012|ContainerComponentTypeCodeSequence|Container Component Type Code Sequence|SQ|1||
00500013|ContainerComponentThickness|Container Component Thickness|FD|1||
00500014|DeviceLength|Device Length|DS|1||
00500015|ContainerComponentWidth|Container Component Width|FD|1||
00500016|DeviceDiameter|Device Diameter|DS|1||
00500017|DeviceDiameterUnits|Device Diameter Units|CS|1||
00500018|DeviceVolume|Device Volume|DS|1||
00500019|InterMarkerDistance|Inter-Marker Distance|DS|1||
0050001A|ContainerComponentMaterial|Container Component Material|CS|1||
0050001B|ContainerComponentID|Container Component ID|LO|1||
0050001C|ContainerComponentLength|Container Component Length|FD|1||
0050001D|ContainerComponentDiameter|Container Component Diameter|FD|1||
0050001E|ContainerComponentDescription|Container Component Description|LO|1||
00500020|DeviceDescription|Device Description|LO|1||
00500021|LongDeviceDescription|Long Device Description|ST|1||
00520001|ContrastBolusIngredientPercentByVolume|Contrast/Bolus Ingredient Percent by Volume|FL|1||
00520002|OCTFocalDistance|OCT Focal Distance|FD|1||
00520003|BeamSpotSize|Beam Spot Size|FD|1||
00520004|EffectiveRefractiveIndex|Effective Refractive Index|FD|1||
00520006|OCTAcquisitionDomain|OCT Acquisition Domain|CS|1||
00520007|OCTOpticalCenterWavelength|OCT Optical Center Wavelength|FD|1||
00520008|AxialResolution|Axial Resolution|FD|1||
00520009|RangingDepth|Ranging Depth|FD|1||
00520011|ALineRate|A-line Rate|FD|1||
00520012|ALinesPerFrame|A-lines Per Frame|US|1||
00520013|CatheterRotationalRate|Catheter Rotational Rate|FD|1||
00520014|ALinePixelSpacing|A-line Pixel Spacing|FD|1||
00520016|ModeOfPercutaneousAccessSequence|Mode of Percutaneous Access Sequence|SQ|1||
00520025|IntravascularOCTFrameTypeSequence|Intravascular OCT Frame Type Sequence|SQ|1||
00520026|OCTZOffsetApplied|OCT Z Offset Applied|CS|1||
00520027|IntravascularFrameContentSequence|Intravascular Frame Content Sequence|SQ|1||
00520028|IntravascularLongitudinalDistance|Intravascular Longitudinal Distance|FD|1||
00520029|IntravascularOCTFrameContentSequence|Intravascular OCT Frame Content Sequence|SQ|1||
00520030|OCTZOffsetCorrection|OCT Z Offset Correction|SS|1||
00520031|CatheterDirectionOfRotation|Catheter Direction of Rotation|CS|1||
00520033|SeamLineLocation|Seam Line Location|FD|1||
00520034|FirstALineLocation|First A-line Location|FD|1||
00520036|SeamLineIndex|Seam Line Index|US|1||
00520038|NumberOfPaddedALines|Number of Padded A-lines|US|1||
00520039|InterpolationType|Interpolation Type|CS|1||
0052003A|RefractiveIndexApplied|Refractive Index Applied|CS|1||
00540010|EnergyWindowVector|Energy Window Vector|US|1-n||
00540011|NumberOfEnergyWindows|Number of Energy Windows|US|1||
00540012|EnergyWindowInformationSequence|Energy Window Information Sequence|SQ|1||
00540013|EnergyWindowRangeSequence|Energy Window Range Sequence|SQ|1||
00540014|EnergyWindowLowerLimit|Energy Window Lower Limit|DS|1||
00540015|EnergyWindowUpperLimit|Energy Window Upper Limit|DS|1||
00540016|RadiopharmaceuticalInformationSequence|Radiopharmaceutical Information Sequence|SQ|1||
00540017|ResidualSyringeCounts|Residual Syringe Counts|IS|1||
00540018|EnergyWindowName|Energy Window Name|SH|1||
00540020|DetectorVector|Detector Vector|US|1-n||
00540021|NumberOfDetectors|Number of Detectors|US|1||
00540022|DetectorInformationSequence|Detector Information Sequence|SQ|1||
00540030|PhaseVector|Phase Vector|US|1-n||
00540031|NumberOfPhases|Number of Phases|US|1||
00540032|PhaseInformationSequence|Phase Information Sequence|SQ|1||
00540033|NumberOfFramesInPhase|Number of Frames in Phase|US|1||
00540036|PhaseDelay|Phase Delay|IS|1||
00540038|PauseBetweenFrames|Pause Between Frames|IS|1||
00540039|PhaseDescription|Phase Description|CS|1||
00540050|RotationVector|Rotation Vector|US|1-n||
00540051|NumberOfRotations|Number of Rotations|US|1||
00540052|RotationInformationSequence|Rotation Information Sequence|SQ|1||
00540053|NumberOfFramesInRotation|Number of Frames in Rotation|US|1||
00540060|RRIntervalVector|R-R Interval Vector|US|1-n||
00540061|NumberOfRRIntervals|Number of R-R Intervals|US|1||
00540062|GatedInformationSequence|Gated Information Sequence|SQ|1||
00540063|DataInformationSequence|Data Information Sequence|SQ|1||
00540070|TimeSlotVector|Time Slot Vector|US|1-n||
00540071|NumberOfTimeSlots|Number of Time Slots|US|1||
00540072|TimeSlotInformationSequence|Time Slot Information Sequence|SQ|1||
00540073|TimeSlotTime|Time Slot Time|DS|1||
00540080|SliceVector|Slice Vector|US|1-n||
00540081|NumberOfSlices|Number of Slices|US|1||
00540090|AngularViewVector|Angular View Vector|US|1-n||
00540100|TimeSliceVector|Time Slice Vector|US|1-n||
00540101|NumberOfTimeSlices|Number of Time Slices|US|1||
00540200|StartAngle|Start Angle|DS|1||
00540202|TypeOfDetectorMotion|Type of Detector Motion|CS|1||
00540210|TriggerVector|Trigger Vector|IS|1-n||
00540211|NumberOfTriggersInPhase|Number of Triggers in Phase|US|1||
00540220|ViewCodeSequence|View Code Sequence|SQ|1||
00540222|ViewModifierCodeSequence|View Modifier Code Sequence|SQ|1||
00540300|RadionuclideCodeSequence|Radionuclide Code Sequence|SQ|1||
00540302|AdministrationRouteCodeSequence|Administration Route Code Sequence|SQ|1||
00540304|RadiopharmaceuticalCodeSequence|Radiopharmaceutical Code Sequence|SQ|1||
00540306|CalibrationDataSequence|Calibration Data Sequence|SQ|1||
00540308|EnergyWindowNumber|Energy Window Number|US|1||
00540400|ImageID|Image ID|SH|1||
00540410|PatientOrientationCodeSequence|Patient Orientation Code Sequence|SQ|1||
00540412|PatientOrientationModifierCodeSequence|Patient Orientation Modifier Code Sequence|SQ|1||
00540414|PatientGantryRelationshipCodeSequence|Patient Gantry Relationship Code Sequence|SQ|1||
00540500|SliceProgressionDirection|Slice Progression Direction|CS|1||
00540501|ScanProgressionDirection|Scan Progression Direction|CS|1||
00541000|SeriesType|Series Type|CS|2||
00541001|Units|Units|CS|1||
00541002|CountsSource|Counts Source|CS|1||
00541004|ReprojectionMethod|Reprojection Method|CS|1||
00541006|SUVType|SUV Type|CS|1||
00541100|RandomsCorrectionMethod|Randoms Correction Method|CS|1||
00541101|AttenuationCorrectionMethod|Attenuation Correction Method|LO|1||
00541102|DecayCorrection|Decay Correction|CS|1||
00541103|ReconstructionMethod|Reconstruction Method|LO|1||
00541104|DetectorLinesOfResponseUsed|Detector Lines of Response Used|LO|1||
00541105|ScatterCorrectionMethod|Scatter Correction Method|LO|1||
00541200|AxialAcceptance|Axial Acceptance|DS|1||
00541201|AxialMash|Axial Mash|IS|2||
00541202|TransverseMash|Transverse Mash|IS|1||
00541203|DetectorElementSize|Detector Element Size|DS|2||
00541210|CoincidenceWindowWidth|Coincidence Window Width|DS|1||
00541220|SecondaryCountsType|Secondary Counts Type|CS|1-n||
00541300|FrameReferenceTime|Frame Reference Time|DS|1||
00541310|PrimaryPromptsCountsAccumulated|Primary (Prompts) Counts Accumulated|IS|1||
00541311|SecondaryCountsAccumulated|Secondary Counts Accumulated|IS|1-n||
00541320|SliceSensitivityFactor|Slice Sensitivity Factor|DS|1||
00541321|DecayFactor|Decay Factor|DS|1||
00541322|DoseCalibrationFactor|Dose Calibration Factor|DS|1||
00541323|ScatterFractionFactor|Scatter Fraction Factor|DS|1||
00541324|DeadTimeFactor|Dead Time Factor|DS|1||
00541330|ImageIndex|Image Index|US|1||
00541400|CountsIncluded|Counts Included|CS|1-n|R|
00541401|DeadTimeCorrectionFlag|Dead Time Correction Flag|CS|1|R|
00603000|HistogramSequence|Histogram Sequence|SQ|1||
00603002|HistogramNumberOfBins|Histogram Number of Bins|US|1||
00603004|HistogramFirstBinValue|Histogram First Bin Value|US/SS|1||
00603006|HistogramLastBinValue|Histogram Last Bin Value|US/SS|1||
00603008|HistogramBinWidth|Histogram Bin Width|US|1||
00603010|HistogramExplanation|Histogram Explanation|LO|1||
00603020|HistogramData|Histogram Data|UL|1-n||
00620001|SegmentationType|Segmentation Type|CS|1||
00620002|SegmentSequence|Segment Sequence|SQ|1||
00620003|SegmentedPropertyCategoryCodeSequence|Segmented Property Category Code Sequence|SQ|1||
00620004|SegmentNumber|Segment Number|US|1||
00620005|SegmentLabel|Segment Label|LO|1||
00620006|SegmentDescription|Segment Description|ST|1||
00620007|SegmentationAlgorithmIdentificationSequence|Segmentation Algorithm Identification Sequence|SQ|1||
00620008|SegmentAlgorithmType|Segment Algorithm Type|CS|1||
00620009|SegmentAlgorithmName|Segment Algorithm Name|LO|1-n||
0062000A|SegmentIdentificationSequence|Segment Identification Sequence|SQ|1||
0062000B|ReferencedSegmentNumber|Referenced Segment Number|US|1-n||
0062000C|RecommendedDisplayGrayscaleValue|Recommended Display Grayscale Value|US|1||
0062000D|RecommendedDisplayCIELabValue|Recommended Display CIELab Value|US|3||
0062000E|MaximumFractionalValue|Maximum Fractional Value|US|1||
0062000F|SegmentedPropertyTypeCodeSequence|Segmented Property Type Code Sequence|SQ|1||
00620010|SegmentationFractionalType|Segmentation Fractional Type|CS|1||
00620011|SegmentedPropertyTypeModifierCodeSequence|Segmented Property Type Modifier Code Sequence|SQ|1||
00620012|UsedSegmentsSequence|Used Segments Sequence|SQ|1||
00620013|SegmentsOverlap|Segments Overlap|CS|1||
00620020|TrackingID|Tracking ID|UT|1||
00620021|TrackingUID|Tracking UID|UI|1||
00640002|DeformableRegistrationSequence|Deformable Registration Sequence|SQ|1||
00640003|SourceFrameOfReferenceUID|Source Frame of Reference UID|UI|1||
00640005|DeformableRegistrationGridSequence|Deformable Registration Grid Sequence|SQ|1||
00640007|GridDimensions|Grid Dimensions|UL|3||
00640008|GridResolution|Grid Resolution|FD|3||
00640009|VectorGridData|Vector Grid Data|OF|1||
0064000F|PreDeformationMatrixRegistrationSequence|Pre Deformation Matrix Registration Sequence|SQ|1||
00640010|PostDeformationMatrixRegistrationSequence|Post Deformation Matrix Registration Sequence|SQ|1||
00660001|NumberOfSurfaces|Number of Surfaces|UL|1||
00660002|SurfaceSequence|Surface Sequence|SQ|1||
00660003|SurfaceNumber|Surface Number|UL|1||
00660004|SurfaceComments|Surface Comments|LT|1||
00660005|SurfaceOffset|Surface Offset|FL|1||
00660009|SurfaceProcessing|Surface Processing|CS|1||
0066000A|SurfaceProcessingRatio|Surface Processing Ratio|FL|1||
0066000B|SurfaceProcessingDescription|Surface Processing Description|LO|1||
0066000C|RecommendedPresentationOpacity|Recommended Presentation Opacity|FL|1||
0066000D|RecommendedPresentationType|Recommended Presentation Type|CS|1||
0066000E|FiniteVolume|Finite Volume|CS|1||
00660010|Manifold|Manifold|CS|1||
00660011|SurfacePointsSequence|Surface Points Sequence|SQ|1||
00660012|SurfacePointsNormalsSequence|Surface Points Normals Sequence|SQ|1||
00660013|SurfaceMeshPrimitivesSequence|Surface Mesh Primitives Sequence|SQ|1||
00660015|NumberOfSurfacePoints|Number of Surface Points|UL|1||
00660016|PointCoordinatesData|Point Coordinates Data|OF|1||
00660017|PointPositionAccuracy|Point Position Accuracy|FL|3||
00660018|MeanPointDistance|Mean Point Distance|FL|1||
00660019|MaximumPointDistance|Maximum Point Distance|FL|1||
0066001A|PointsBoundingBoxCoordinates|Points Bounding Box Coordinates|FL|6||
0066001B|AxisOfRotation|Axis of Rotation|FL|3||
0066001C|CenterOfRotation|Center of Rotation|FL|3||
0066001E|NumberOfVectors|Number of Vectors|UL|1||
0066001F|VectorDimensionality|Vector Dimensionality|US|1||
00660020|VectorAccuracy|Vector Accuracy|FL|1-n||
00660021|VectorCoordinateData|Vector Coordinate Data|OF|1||
00660022|DoublePointCoordinatesData|Double Point Coordinates Data|OD|1||
00660023|TrianglePointIndexList|Triangle Point Index List|OW|1|R|
00660024|EdgePointIndexList|Edge Point Index List|OW|1|R|
00660025|VertexPointIndexList|Vertex Point Index List|OW|1|R|
00660026|TriangleStripSequence|Triangle Strip Sequence|SQ|1||
00660027|TriangleFanSequence|Triangle Fan Sequence|SQ|1||
00660028|LineSequence|Line Sequence|SQ|1||
00660029|PrimitivePointIndexList|Primitive Point Index List|OW|1|R|
0066002A|SurfaceCount|Surface Count|UL|1||
0066002B|ReferencedSurfaceSequence|Referenced Surface Sequence|SQ|1||
0066002C|ReferencedSurfaceNumber|Referenced Surface Number|UL|1||
0066002D|SegmentSurfaceGenerationAlgorithmIdentificationSequence|Segment Surface Generation Algorithm Identification Sequence|SQ|1||
0066002E|SegmentSurfaceSourceInstanceSequence|Segment Surface Source Instance Sequence|SQ|1||
0066002F|AlgorithmFamilyCodeSequence|Algorithm Family Code Sequence|SQ|1||
00660030|AlgorithmNameCodeSequence|Algorithm Name Code Sequence|SQ|1||
00660031|AlgorithmVersion|Algorithm Version|LO|1||
00660032|AlgorithmParameters|Algorithm Parameters|LT|1||
00660034|FacetSequence|Facet Sequence|SQ|1||
00660035|SurfaceProcessingAlgorithmIdentificationSequence|Surface Processing Algorithm Identification Sequence|SQ|1||
00660036|AlgorithmName|Algorithm Name|LO|1||
00660037|RecommendedPointRadius|Recommended Point Radius|FL|1||
00660038|RecommendedLineThickness|Recommended Line Thickness|FL|1||
00660040|LongPrimitivePointIndexList|Long Primitive Point Index List|OL|1||
00660041|LongTrianglePointIndexList|Long Triangle Point Index List|OL|1||
00660042|LongEdgePointIndexList|Long Edge Point Index List|OL|1||
00660043|LongVertexPointIndexList|Long Vertex Point Index List|OL|1||
00660101|TrackSetSequence|Track Set Sequence|SQ|1||
00660102|TrackSequence|Track Sequence|SQ|1||
00660103|RecommendedDisplayCIELabValueList|Recommended Display CIELab Value List|OW|1||
00660104|TrackingAlgorithmIdentificationSequence|Tracking Algorithm Identification Sequence|SQ|1||
00660105|TrackSetNumber|Track Set Number|UL|1||
00660106|TrackSetLabel|Track Set Label|LO|1||
00660107|TrackSetDescription|Track Set Description|UT|1||
00660108|TrackSetAnatomicalTypeCodeSequence|Track Set Anatomical Type Code Sequence|SQ|1||
00660121|MeasurementsSequence|Measurements Sequence|SQ|1||
00660124|TrackSetStatisticsSequence|Track Set Statistics Sequence|SQ|1||
00660125|FloatingPointValues|Floating Point Values|OF|1||
00660129|TrackPointIndexList|Track Point Index List|OL|1||
00660130|TrackStatisticsSequence|Track Statistics Sequence|SQ|1||
00660132|MeasurementValuesSequence|Measurement Values Sequence|SQ|1||
00660133|DiffusionAcquisitionCodeSequence|Diffusion Acquisition Code Sequence|SQ|1||
00660134|DiffusionModelCodeSequence|Diffusion Model Code Sequence|SQ|1||
00686210|ImplantSize|Implant Size|LO|1||
00686221|ImplantTemplateVersion|Implant Template Version|LO|1||
00686222|ReplacedImplantTemplateSequence|Replaced Implant Template Sequence|SQ|1||
00686223|ImplantType|Implant Type|CS|1||
00686224|DerivationImplantTemplateSequence|Derivation Implant Template Sequence|SQ|1||
00686225|OriginalImplantTemplateSequence|Original Implant Template Sequence|SQ|1||
00686226|EffectiveDateTime|Effective DateTime|DT|1||
00686230|ImplantTargetAnatomySequence|Implant Target Anatomy Sequence|SQ|1||
00686260|InformationFromManufacturerSequence|Information From Manufacturer Sequence|SQ|1||
00686265|NotificationFromManufacturerSequence|Notification From Manufacturer Sequence|SQ|1||
00686270|InformationIssueDateTime|Information Issue DateTime|DT|1||
00686280|InformationSummary|Information Summary|ST|1||
006862A0|ImplantRegulatoryDisapprovalCodeSequence|Implant Regulatory Disapproval Code Sequence|SQ|1||
006862A5|OverallTemplateSpatialTolerance|Overall Template Spatial Tolerance|FD|1||
006862C0|HPGLDocumentSequence|HPGL Document Sequence|SQ|1||
006862D0|HPGLDocumentID|HPGL Document ID|US|1||
006862D5|HPGLDocumentLabel|HPGL Document Label|LO|1||
006862E0|ViewOrientationCodeSequence|View Orientation Code Sequence|SQ|1||
006862F0|ViewOrientationModifierCodeSequence|View Orientation Modifier Code Sequence|SQ|1||
006862F2|HPGLDocumentScaling|HPGL Document Scaling|FD|1||
00686300|HPGLDocument|HPGL Document|OB|1||
00686310|HPGLContourPenNumber|HPGL Contour Pen Number|US|1||
00686320|HPGLPenSequence|HPGL Pen Sequence|SQ|1||
00686330|HPGLPenNumber|HPGL Pen Number|US|1||
00686340|HPGLPenLabel|HPGL Pen Label|LO|1||
00686345|HPGLPenDescription|HPGL Pen Description|ST|1||
00686346|RecommendedRotationPoint|Recommended Rotation Point|FD|2||
00686347|BoundingRectangle|Bounding Rectangle|FD|4||
00686350|ImplantTemplate3DModelSurfaceNumber|Implant Template 3D Model Surface Number|US|1-n||
00686360|SurfaceModelDescriptionSequence|Surface Model Description Sequence|SQ|1||
00686380|SurfaceModelLabel|Surface Model Label|LO|1||
00686390|SurfaceModelScalingFactor|Surface Model Scaling Factor|FD|1||
006863A0|MaterialsCodeSequence|Materials Code Sequence|SQ|1||
006863A4|CoatingMaterialsCodeSequence|Coating Materials Code Sequence|SQ|1||
006863A8|ImplantTypeCodeSequence|Implant Type Code Sequence|SQ|1||
006863AC|FixationMethodCodeSequence|Fixation Method Code Sequence|SQ|1||
006863B0|MatingFeatureSetsSequence|Mating Feature Sets Sequence|SQ|1||
006863C0|MatingFeatureSetID|Mating Feature Set ID|US|1||
006863D0|MatingFeatureSetLabel|Mating Feature Set Label|LO|1||
006863E0|MatingFeatureSequence|Mating Feature Sequence|SQ|1||
006863F0|MatingFeatureID|Mating Feature ID|US|1||
00686400|MatingFeatureDegreeOfFreedomSequence|Mating Feature Degree of Freedom Sequence|SQ|1||
00686410|DegreeOfFreedomID|Degree of Freedom ID|US|1||
00686420|DegreeOfFreedomType|Degree of Freedom Type|CS|1||
00686430|TwoDMatingFeatureCoordinatesSequence|2D Mating Feature Coordinates Sequence|SQ|1||
00686440|ReferencedHPGLDocumentID|Referenced HPGL Document ID|US|1||
00686450|TwoDMatingPoint|2D Mating Point|FD|2||
00686460|TwoDMatingAxes|2D Mating Axes|FD|4||
00686470|TwoDDegreeOfFreedomSequence|2D Degree of Freedom Sequence|SQ|1||
00686490|ThreeDDegreeOfFreedomAxis|3D Degree of Freedom Axis|FD|3||
006864A0|RangeOfFreedom|Range of Freedom|FD|2||
006864C0|ThreeDMatingPoint|3D Mating Point|FD|3||
006864D0|ThreeDMatingAxes|3D Mating Axes|FD|9||
006864F0|TwoDDegreeOfFreedomAxis|2D Degree of Freedom Axis|FD|3||
00686500|PlanningLandmarkPointSequence|Planning Landmark Point Sequence|SQ|1||
00686510|PlanningLandmarkLineSequence|Planning Landmark Line Sequence|SQ|1||
00686520|PlanningLandmarkPlaneSequence|Planning Landmark Plane Sequence|SQ|1||
00686530|PlanningLandmarkID|Planning Landmark ID|US|1||
00686540|PlanningLandmarkDescription|Planning Landmark Description|LO|1||
00686545|PlanningLandmarkIdentificationCodeSequence|Planning Landmark Identification Code Sequence|SQ|1||
00686550|TwoDPointCoordinatesSequence|2D Point Coordinates Sequence|SQ|1||
00686560|TwoDPointCoordinates|2D Point Coordinates|FD|2||
00686590|ThreeDPointCoordinates|3D Point Coordinates|FD|3||
006865A0|TwoDLineCoordinatesSequence|2D Line Coordinates Sequence|SQ|1||
006865B0|TwoDLineCoordinates|2D Line Coordinates|FD|4||
006865D0|ThreeDLineCoordinates|3D Line Coordinates|FD|6||
006865E0|TwoDPlaneCoordinatesSequence|2D Plane Coordinates Sequence|SQ|1||
006865F0|TwoDPlaneIntersection|2D Plane Intersection|FD|4||
00686610|ThreeDPlaneOrigin|3D Plane Origin|FD|3||
00686620|ThreeDPlaneNormal|3D Plane Normal|FD|3||
00687001|ModelModification|Model Modification|CS|1||
00687002|ModelMirroring|Model Mirroring|CS|1||
00687003|ModelUsageCodeSequence|Model Usage Code Sequence|SQ|1||
00687004|ModelGroupUID|Model Group UID|UI|1||
00687005|RelativeURIReferenceWithinEncapsulatedDocument|Relative URI Reference Within Encapsulated Document|UR|1||
006A0001|AnnotationCoordinateType|Annotation Coordinate Type|CS|1||
006A0002|AnnotationGroupSequence|Annotation Group Sequence|SQ|1||
006A0003|AnnotationGroupUID|Annotation Group UID|UI|1||
006A0005|AnnotationGroupLabel|Annotation Group Label|LO|1||
006A0006|AnnotationGroupDescription|Annotation Group Description|UT|1||
006A0007|AnnotationGroupGenerationType|Annotation Group Generation Type|CS|1||
006A0008|AnnotationGroupAlgorithmIdentificationSequence|Annotation Group Algorithm Identification Sequence|SQ|1||
006A0009|AnnotationPropertyCategoryCodeSequence|Annotation Property Category Code Sequence|SQ|1||
006A000A|AnnotationPropertyTypeCodeSequence|Annotation Property Type Code Sequence|SQ|1||
006A000B|AnnotationPropertyTypeModifierCodeSequence|Annotation Property Type Modifier Code Sequence|SQ|1||
006A000C|NumberOfAnnotations|Number of Annotations|UL|1||
006A000D|AnnotationAppliesToAllOpticalPaths|Annotation Applies to All Optical Paths|CS|1||
006A000E|ReferencedOpticalPathIdentifier|Referenced Optical Path Identifier|SH|1-n||
006A000F|AnnotationAppliesToAllZPlanes|Annotation Applies to All Z Planes|CS|1||
006A0010|CommonZCoordinateValue|Common Z Coordinate Value|FD|1-n||
006A0011|AnnotationIndexList|Annotation Index List|OL|1||
00700001|GraphicAnnotationSequence|Graphic Annotation Sequence|SQ|1||
00700002|GraphicLayer|Graphic Layer|CS|1||
00700003|BoundingBoxAnnotationUnits|Bounding Box Annotation Units|CS|1||
00700004|AnchorPointAnnotationUnits|Anchor Point Annotation Units|CS|1||
00700005|GraphicAnnotationUnits|Graphic Annotation Units|CS|1||
00700006|UnformattedTextValue|Unformatted Text Value|ST|1||
00700008|TextObjectSequence|Text Object Sequence|SQ|1||
00700009|GraphicObjectSequence|Graphic Object Sequence|SQ|1||
00700010|BoundingBoxTopLeftHandCorner|Bounding Box Top Left Hand Corner|FL|2||
00700011|BoundingBoxBottomRightHandCorner|Bounding Box Bottom Right Hand Corner|FL|2||
00700012|BoundingBoxTextHorizontalJustification|Bounding Box Text Horizontal Justification|CS|1||
00700014|AnchorPoint|Anchor Point|FL|2||
00700015|AnchorPointVisibility|Anchor Point Visibility|CS|1||
00700020|GraphicDimensions|Graphic Dimensions|US|1||
00700021|NumberOfGraphicPoints|Number of Graphic Points|US|1||
00700022|GraphicData|Graphic Data|FL|2-n||
00700023|GraphicType|Graphic Type|CS|1||
00700024|GraphicFilled|Graphic Filled|CS|1||
00700040|ImageRotationRetired|Image Rotation (Retired)|IS|1|R|
00700041|ImageHorizontalFlip|Image Horizontal Flip|CS|1||
00700042|ImageRotation|Image Rotation|US|1||
00700050|DisplayedAreaTopLeftHandCornerTrial|Displayed Area Top Left Hand Corner (Trial)|US|2|R|
00700051|DisplayedAreaBottomRightHandCornerTrial|Displayed Area Bottom Right Hand Corner (Trial)|US|2|R|
00700052|DisplayedAreaTopLeftHandCorner|Displayed Area Top Left Hand Corner|SL|2||
00700053|DisplayedAreaBottomRightHandCorner|Displayed Area Bottom Right Hand Corner|SL|2||
0070005A|DisplayedAreaSelectionSequence|Displayed Area Selection Sequence|SQ|1||
00700060|GraphicLayerSequence|Graphic Layer Sequence|SQ|1||
00700062|GraphicLayerOrder|Graphic Layer Order|IS|1||
00700066|GraphicLayerRecommendedDisplayGrayscaleValue|Graphic Layer Recommended Display Grayscale Value|US|1||
00700067|GraphicLayerRecommendedDisplayRGBValue|Graphic Layer Recommended Display RGB Value|US|3|R|
00700068|GraphicLayerDescription|Graphic Layer Description|LO|1||
00700080|ContentLabel|Content Label|CS|1||
00700081|ContentDescription|Content Description|LO|1||
00700082|PresentationCreationDate|Presentation Creation Date|DA|1||
00700083|PresentationCreationTime|Presentation Creation Time|TM|1||
00700084|ContentCreatorName|Content Creator's Name|PN|1||
00700086|ContentCreatorIdentificationCodeSequence|Content Creator's Identification Code Sequence|SQ|1||
00700087|AlternateContentDescriptionSequence|Alternate Content Description Sequence|SQ|1||
00700100|PresentationSizeMode|Presentation Size Mode|CS|1||
00700101|PresentationPixelSpacing|Presentation Pixel Spacing|DS|2||
00700102|PresentationPixelAspectRatio|Presentation Pixel Aspect Ratio|IS|2||
00700103|PresentationPixelMagnificationRatio|Presentation Pixel Magnification Ratio|FL|1||
00700207|GraphicGroupLabel|Graphic Group Label|LO|1||
00700208|GraphicGroupDescription|Graphic Group Description|ST|1||
00700209|CompoundGraphicSequence|Compound Graphic Sequence|SQ|1||
00700226|CompoundGraphicInstanceID|Compound Graphic Instance ID|UL|1||
00700227|FontName|Font Name|LO|1||
00700228|FontNameType|Font Name Type|CS|1||
00700229|CSSFontName|CSS Font Name|LO|1||
00700230|RotationAngle|Rotation Angle|FD|1||
00700231|TextStyleSequence|Text Style Sequence|SQ|1||
00700232|LineStyleSequence|Line Style Sequence|SQ|1||
00700233|FillStyleSequence|Fill Style Sequence|SQ|1||
00700234|GraphicGroupSequence|Graphic Group Sequence|SQ|1||
00700241|TextColorCIELabValue|Text Color CIELab Value|US|3||
00700242|HorizontalAlignment|Horizontal Alignment|CS|1||
00700243|VerticalAlignment|Vertical Alignment|CS|1||
00700244|ShadowStyle|Shadow Style|CS|1||
00700245|ShadowOffsetX|Shadow Offset X|FL|1||
00700246|ShadowOffsetY|Shadow Offset Y|FL|1||
00700247|ShadowColorCIELabValue|Shadow Color CIELab Value|US|3||
00700248|Underlined|Underlined|CS|1||
00700249|Bold|Bold|CS|1||
00700250|Italic|Italic|CS|1||
00700251|PatternOnColorCIELabValue|Pattern On Color CIELab Value|US|3||
00700252|PatternOffColorCIELabValue|Pattern Off Color CIELab Value|US|3||
00700253|LineThickness|Line Thickness|FL|1||
00700254|LineDashingStyle|Line Dashing Style|CS|1||
00700255|LinePattern|Line Pattern|UL|1||
00700256|FillPattern|Fill Pattern|OB|1||
00700257|FillMode|Fill Mode|CS|1||
00700258|ShadowOpacity|Shadow Opacity|FL|1||
00700261|GapLength|Gap Length|FL|1||
00700262|DiameterOfVisibility|Diameter of Visibility|FL|1||
00700273|RotationPoint|Rotation Point|FL|2||
00700274|TickAlignment|Tick Alignment|CS|1||
00700278|ShowTickLabel|Show Tick Label|CS|1||
00700279|TickLabelAlignment|Tick Label Alignment|CS|1||
00700282|CompoundGraphicUnits|Compound Graphic Units|CS|1||
00700284|PatternOnOpacity|Pattern On Opacity|FL|1||
00700285|PatternOffOpacity|Pattern Off Opacity|FL|1||
00700287|MajorTicksSequence|Major Ticks Sequence|SQ|1||
00700288|TickPosition|Tick Position|FL|1||
00700289|TickLabel|Tick Label|SH|1||
00700294|CompoundGraphicType|Compound Graphic Type|CS|1||
00700295|GraphicGroupID|Graphic Group ID|UL|1||
00700306|ShapeType|Shape Type|CS|1||
00700308|RegistrationSequence|Registration Sequence|SQ|1||
00700309|MatrixRegistrationSequence|Matrix Registration Sequence|SQ|1||
0070030A|MatrixSequence|Matrix Sequence|SQ|1||
0070030B|FrameOfReferenceToDisplayedCoordinateSystemTransformationMatrix|Frame of Reference to Displayed Coordinate System Transformation Matrix|FD|16||
0070030C|FrameOfReferenceTransformationMatrixType|Frame of Reference Transformation Matrix Type|CS|1||
0070030D|RegistrationTypeCodeSequence|Registration Type Code Sequence|SQ|1||
0070030F|FiducialDescription|Fiducial Description|ST|1||
00700310|FiducialIdentifier|Fiducial Identifier|SH|1||
00700311|FiducialIdentifierCodeSequence|Fiducial Identifier Code Sequence|SQ|1||
00700312|ContourUncertaintyRadius|Contour Uncertainty Radius|FD|1||
00700314|UsedFiducialsSequence|Used Fiducials Sequence|SQ|1||
00700315|UsedRTStructureSetROISequence|Used RT Structure Set ROI Sequence|SQ|1||
00700318|GraphicCoordinatesDataSequence|Graphic Coordinates Data Sequence|SQ|1||
0070031A|FiducialUID|Fiducial UID|UI|1||
0070031B|ReferencedFiducialUID|Referenced Fiducial UID|UI|1||
0070031C|FiducialSetSequence|Fiducial Set Sequence|SQ|1||
0070031E|FiducialSequence|Fiducial Sequence|SQ|1||
0070031F|FiducialsPropertyCategoryCodeSequence|Fiducials Property Category Code Sequence|SQ|1||
00700401|GraphicLayerRecommendedDisplayCIELabValue|Graphic Layer Recommended Display CIELab Value|US|3||
00700402|BlendingSequence|Blending Sequence|SQ|1||
00700403|RelativeOpacity|Relative Opacity|FL|1||
00700404|ReferencedSpatialRegistrationSequence|Referenced Spatial Registration Sequence|SQ|1||
00700405|BlendingPosition|Blending Position|CS|1||
00701101|PresentationDisplayCollectionUID|Presentation Display Collection UID|UI|1||
00701102|PresentationSequenceCollectionUID|Presentation Sequence Collection UID|UI|1||
00701103|PresentationSequencePositionIndex|Presentation Sequence Position Index|US|1||
00701104|RenderedImageReferenceSequence|Rendered Image Reference Sequence|SQ|1||
00701201|VolumetricPresentationStateInputSequence|Volumetric Presentation State Input Sequence|SQ|1||
00701202|PresentationInputType|Presentation Input Type|CS|1||
00701203|InputSequencePositionIndex|Input Sequence Position Index|US|1||
00701204|Crop|Crop|CS|1||
00701205|CroppingSpecificationIndex|Cropping Specification Index|US|1-n||
00701206|CompositingMethod|Compositing Method|CS|1|R|
00701207|VolumetricPresentationInputNumber|Volumetric Presentation Input Number|US|1||
00701208|ImageVolumeGeometry|Image Volume Geometry|CS|1||
00701209|VolumetricPresentationInputSetUID|Volumetric Presentation Input Set UID|UI|1||
0070120A|VolumetricPresentationInputSetSequence|Volumetric Presentation Input Set Sequence|SQ|1||
0070120B|GlobalCrop|Global Crop|CS|1||
0070120C|GlobalCroppingSpecificationIndex|Global Cropping Specification Index|US|1-n||
0070120D|RenderingMethod|Rendering Method|CS|1||
00701301|VolumeCroppingSequence|Volume Cropping Sequence|SQ|1||
00701302|VolumeCroppingMethod|Volume Cropping Method|CS|1||
00701303|BoundingBoxCrop|Bounding Box Crop|FD|6||
00701304|ObliqueCroppingPlaneSequence|Oblique Cropping Plane Sequence|SQ|1||
00701305|Plane|Plane|FD|4||
00701306|PlaneNormal|Plane Normal|FD|3||
00701309|CroppingSpecificationNumber|Cropping Specification Number|US|1||
00701501|MultiPlanarReconstructionStyle|Multi-Planar Reconstruction Style|CS|1||
00701502|MPRThicknessType|MPR Thickness Type|CS|1||
00701503|MPRSlabThickness|MPR Slab Thickness|FD|1||
00701505|MPRTopLeftHandCorner|MPR Top Left Hand Corner|FD|3||
00701507|MPRViewWidthDirection|MPR View Width Direction|FD|3||
00701508|MPRViewWidth|MPR View Width|FD|1||
0070150C|NumberOfVolumetricCurvePoints|Number of Volumetric Curve Points|UL|1||
0070150D|VolumetricCurvePoints|Volumetric Curve Points|OD|1||
00701511|MPRViewHeightDirection|MPR View Height Direction|FD|3||
00701512|MPRViewHeight|MPR View Height|FD|1||
00701602|RenderProjection|Render Projection|CS|1||
00701603|ViewpointPosition|Viewpoint Position|FD|3||
00701604|ViewpointLookAtPoint|Viewpoint LookAt Point|FD|3||
00701605|ViewpointUpDirection|Viewpoint Up Direction|FD|3||
00701606|RenderFieldOfView|Render Field of View|FD|6||
00701607|SamplingStepSize|Sampling Step Size|FD|1||
00701701|ShadingStyle|Shading Style|CS|1||
00701702|AmbientReflectionIntensity|Ambient Reflection Intensity|FD|1||
00701703|LightDirection|Light Direction|FD|3||
00701704|DiffuseReflectionIntensity|Diffuse Reflection Intensity|FD|1||
00701705|SpecularReflectionIntensity|Specular Reflection Intensity|FD|1||
00701706|Shininess|Shininess|FD|1||
00701801|PresentationStateClassificationComponentSequence|Presentation State Classification Component Sequence|SQ|1||
00701802|ComponentType|Component Type|CS|1||
00701803|ComponentInputSequence|Component Input Sequence|SQ|1||
00701804|VolumetricPresentationInputIndex|Volumetric Presentation Input Index|US|1||
00701805|PresentationStateCompositorComponentSequence|Presentation State Compositor Component Sequence|SQ|1||
00701806|WeightingTransferFunctionSequence|Weighting Transfer Function Sequence|SQ|1||
00701807|WeightingLookupTableDescriptor|Weighting Lookup Table Descriptor|US|3|R|
00701808|WeightingLookupTableData|Weighting Lookup Table Data|OB|1|R|
00701901|VolumetricAnnotationSequence|Volumetric Annotation Sequence|SQ|1||
00701903|ReferencedStructuredContextSequence|Referenced Structured Context Sequence|SQ|1||
00701904|ReferencedContentItem|Referenced Content Item|UI|1||
00701905|VolumetricPresentationInputAnnotationSequence|Volumetric Presentation Input Annotation Sequence|SQ|1||
00701907|AnnotationClipping|Annotation Clipping|CS|1||
00701A01|PresentationAnimationStyle|Presentation Animation Style|CS|1||
00701A03|RecommendedAnimationRate|Recommended Animation Rate|FD|1||
00701A04|AnimationCurveSequence|Animation Curve Sequence|SQ|1||
00701A05|AnimationStepSize|Animation Step Size|FD|1||
00701A06|SwivelRange|Swivel Range|FD|1||
00701A07|VolumetricCurveUpDirections|Volumetric Curve Up Directions|OD|1||
00701A08|VolumeStreamSequence|Volume Stream Sequence|SQ|1||
00701A09|RGBATransferFunctionDescription|RGBA Transfer Function Description|LO|1||
00701B01|AdvancedBlendingSequence|Advanced Blending Sequence|SQ|1||
00701B02|BlendingInputNumber|Blending Input Number|US|1||
00701B03|BlendingDisplayInputSequence|Blending Display Input Sequence|SQ|1||
00701B04|BlendingDisplaySequence|Blending Display Sequence|SQ|1||
00701B06|BlendingMode|Blending Mode|CS|1||
00701B07|TimeSeriesBlending|Time Series Blending|CS|1||
00701B08|GeometryForDisplay|Geometry for Display|CS|1||
00701B11|ThresholdSequence|Threshold Sequence|SQ|1||
00701B12|ThresholdValueSequence|Threshold Value Sequence|SQ|1||
00701B13|ThresholdType|Threshold Type|CS|1||
00701B14|ThresholdValue|Threshold Value|FD|1||
00720002|HangingProtocolName|Hanging Protocol Name|SH|1||
00720004|HangingProtocolDescription|Hanging Protocol Description|LO|1||
00720006|HangingProtocolLevel|Hanging Protocol Level|CS|1||
00720008|HangingProtocolCreator|Hanging Protocol Creator|LO|1||
0072000A|HangingProtocolCreationDateTime|Hanging Protocol Creation DateTime|DT|1||
0072000C|HangingProtocolDefinitionSequence|Hanging Protocol Definition Sequence|SQ|1||
0072000E|HangingProtocolUserIdentificationCodeSequence|Hanging Protocol User Identification Code Sequence|SQ|1||
00720010|HangingProtocolUserGroupName|Hanging Protocol User Group Name|LO|1||
00720012|SourceHangingProtocolSequence|Source Hanging Protocol Sequence|SQ|1||
00720014|NumberOfPriorsReferenced|Number of Priors Referenced|US|1||
00720020|ImageSetsSequence|Image Sets Sequence|SQ|1||
00720022|ImageSetSelectorSequence|Image Set Selector Sequence|SQ|1||
00720024|ImageSetSelectorUsageFlag|Image Set Selector Usage Flag|CS|1||
00720026|SelectorAttribute|Selector Attribute|AT|1||
00720028|SelectorValueNumber|Selector Value Number|US|1||
00720030|TimeBasedImageSetsSequence|Time Based Image Sets Sequence|SQ|1||
00720032|ImageSetNumber|Image Set Number|US|1||
00720034|ImageSetSelectorCategory|Image Set Selector Category|CS|1||
00720038|RelativeTime|Relative Time|US|2||
0072003A|RelativeTimeUnits|Relative Time Units|CS|1||
0072003C|AbstractPriorValue|Abstract Prior Value|SS|2||
0072003E|AbstractPriorCodeSequence|Abstract Prior Code Sequence|SQ|1||
00720040|ImageSetLabel|Image Set Label|LO|1||
00720050|SelectorAttributeVR|Selector Attribute VR|CS|1||
00720052|SelectorSequencePointer|Selector Sequence Pointer|AT|1-n||
00720054|SelectorSequencePointerPrivateCreator|Selector Sequence Pointer Private Creator|LO|1-n||
00720056|SelectorAttributePrivateCreator|Selector Attribute Private Creator|LO|1||
0072005E|SelectorAEValue|Selector AE Value|AE|1-n||
0072005F|SelectorASValue|Selector AS Value|AS|1-n||
00720060|SelectorATValue|Selector AT Value|AT|1-n||
00720061|SelectorDAValue|Selector DA Value|DA|1-n||
00720062|SelectorCSValue|Selector CS Value|CS|1-n||
00720063|SelectorDTValue|Selector DT Value|DT|1-n||
00720064|SelectorISValue|Selector IS Value|IS|1-n||
00720065|SelectorOBValue|Selector OB Value|OB|1||
00720066|SelectorLOValue|Selector LO Value|LO|1-n||
00720067|SelectorOFValue|Selector OF Value|OF|1||
00720068|SelectorLTValue|Selector LT Value|LT|1||
00720069|SelectorOWValue|Selector OW Value|OW|1||
0072006A|SelectorPNValue|Selector PN Value|PN|1-n||
0072006B|SelectorTMValue|Selector TM Value|TM|1-n||
0072006C|SelectorSHValue|Selector SH Value|SH|1-n||
0072006D|SelectorUNValue|Selector UN Value|UN|1||
0072006E|SelectorSTValue|Selector ST Value|ST|1||
0072006F|SelectorUCValue|Selector UC Value|UC|1-n||
00720070|SelectorUTValue|Selector UT Value|UT|1||
00720071|SelectorURValue|Selector UR Value|UR|1||
00720072|SelectorDSValue|Selector DS Value|DS|1-n||
00720073|SelectorODValue|Selector OD Value|OD|1||
00720074|SelectorFDValue|Selector FD Value|FD|1-n||
00720075|SelectorOLValue|Selector OL Value|OL|1||
00720076|SelectorFLValue|Selector FL Value|FL|1-n||
00720078|SelectorULValue|Selector UL Value|UL|1-n||
0072007A|SelectorUSValue|Selector US Value|US|1-n||
0072007C|SelectorSLValue|Selector SL Value|SL|1-n||
0072007E|SelectorSSValue|Selector SS Value|SS|1-n||
0072007F|SelectorUIValue|Selector UI Value|UI|1-n||
00720080|SelectorCodeSequenceValue|Selector Code Sequence Value|SQ|1||
00720081|SelectorOVValue|Selector OV Value|OV|1||
00720082|SelectorSVValue|Selector SV Value|SV|1-n||
00720083|SelectorUVValue|Selector UV Value|UV|1-n||
00720100|NumberOfScreens|Number of Screens|US|1||
00720102|NominalScreenDefinitionSequence|Nominal Screen Definition Sequence|SQ|1||
00720104|NumberOfVerticalPixels|Number of Vertical Pixels|US|1||
00720106|NumberOfHorizontalPixels|Number of Horizontal Pixels|US|1||
00720108|DisplayEnvironmentSpatialPosition|Display Environment Spatial Position|FD|4||
0072010A|ScreenMinimumGrayscaleBitDepth|Screen Minimum Grayscale Bit Depth|US|1||
0072010C|ScreenMinimumColorBitDepth|Screen Minimum Color Bit Depth|US|1||
0072010E|ApplicationMaximumRepaintTime|Application Maximum Repaint Time|US|1||
00720200|DisplaySetsSequence|Display Sets Sequence|SQ|1||
00720202|DisplaySetNumber|Display Set Number|US|1||
00720203|DisplaySetLabel|Display Set Label|LO|1||
00720204|DisplaySetPresentationGroup|Display Set Presentation Group|US|1||
00720206|DisplaySetPresentationGroupDescription|Display Set Presentation Group Description|LO|1||
00720208|PartialDataDisplayHandling|Partial Data Display Handling|CS|1||
00720210|SynchronizedScrollingSequence|Synchronized Scrolling Sequence|SQ|1||
00720212|DisplaySetScrollingGroup|Display Set Scrolling Group|US|2-n||
00720214|NavigationIndicatorSequence|Navigation Indicator Sequence|SQ|1||
00720216|NavigationDisplaySet|Navigation Display Set|US|1||
00720218|ReferenceDisplaySets|Reference Display Sets|US|1-n||
00720300|ImageBoxesSequence|Image Boxes Sequence|SQ|1||
00720302|ImageBoxNumber|Image Box Number|US|1||
00720304|ImageBoxLayoutType|Image Box Layout Type|CS|1||
00720306|ImageBoxTileHorizontalDimension|Image Box Tile Horizontal Dimension|US|1||
00720308|ImageBoxTileVerticalDimension|Image Box Tile Vertical Dimension|US|1||
00720310|ImageBoxScrollDirection|Image Box Scroll Direction|CS|1||
00720312|ImageBoxSmallScrollType|Image Box Small Scroll Type|CS|1||
00720314|ImageBoxSmallScrollAmount|Image Box Small Scroll Amount|US|1||
00720316|ImageBoxLargeScrollType|Image Box Large Scroll Type|CS|1||
00720318|ImageBoxLargeScrollAmount|Image Box Large Scroll Amount|US|1||
00720320|ImageBoxOverlapPriority|Image Box Overlap Priority|US|1||
00720330|CineRelativeToRealTime|Cine Relative to Real-Time|FD|1||
00720400|FilterOperationsSequence|Filter Operations Sequence|SQ|1||
00720402|FilterByCategory|Filter-by Category|CS|1||
00720404|FilterByAttributePresence|Filter-by Attribute Presence|CS|1||
00720406|FilterByOperator|Filter-by Operator|CS|1||
00720420|StructuredDisplayBackgroundCIELabValue|Structured Display Background CIELab Value|US|3||
00720421|EmptyImageBoxCIELabValue|Empty Image Box CIELab Value|US|3||
00720422|StructuredDisplayImageBoxSequence|Structured Display Image Box Sequence|SQ|1||
00720424|StructuredDisplayTextBoxSequence|Structured Display Text Box Sequence|SQ|1||
00720427|ReferencedFirstFrameSequence|Referenced First Frame Sequence|SQ|1||
00720430|ImageBoxSynchronizationSequence|Image Box Synchronization Sequence|SQ|1||
00720432|SynchronizedImageBoxList|Synchronized Image Box List|US|2-n||
00720434|TypeOfSynchronization|Type of Synchronization|CS|1||
00720500|BlendingOperationType|Blending Operation Type|CS|1||
00720510|ReformattingOperationType|Reformatting Operation Type|CS|1||
00720512|ReformattingThickness|Reformatting Thickness|FD|1||
00720514|ReformattingInterval|Reformatting Interval|FD|1||
00720516|ReformattingOperationInitialViewDirection|Reformatting Operation Initial View Direction|CS|1||
00720520|ThreeDRenderingType|3D Rendering Type|CS|1-n||
00720600|SortingOperationsSequence|Sorting Operations Sequence|SQ|1||
00720602|SortByCategory|Sort-by Category|CS|1||
00720604|SortingDirection|Sorting Direction|CS|1||
00720700|DisplaySetPatientOrientation|Display Set Patient Orientation|CS|2||
00720702|VOIType|VOI Type|CS|1||
00720704|PseudoColorType|Pseudo-Color Type|CS|1||
00720705|PseudoColorPaletteInstanceReferenceSequence|Pseudo-Color Palette Instance Reference Sequence|SQ|1||
00720706|ShowGrayscaleInverted|Show Grayscale Inverted|CS|1||
00720710|ShowImageTrueSizeFlag|Show Image True Size Flag|CS|1||
00720712|ShowGraphicAnnotationFlag|Show Graphic Annotation Flag|CS|1||
00720714|ShowPatientDemographicsFlag|Show Patient Demographics Flag|CS|1||
00720716|ShowAcquisitionTechniquesFlag|Show Acquisition Techniques Flag|CS|1||
00720717|DisplaySetHorizontalJustification|Display Set Horizontal Justification|CS|1||
00720718|DisplaySetVerticalJustification|Display Set Vertical Justification|CS|1||
00740120|ContinuationStartMeterset|Continuation Start Meterset|FD|1||
00740121|ContinuationEndMeterset|Continuation End Meterset|FD|1||
00741000|ProcedureStepState|Procedure Step State|CS|1||
00741002|ProcedureStepProgressInformationSequence|Procedure Step Progress Information Sequence|SQ|1||
00741004|ProcedureStepProgress|Procedure Step Progress|DS|1||
00741006|ProcedureStepProgressDescription|Procedure Step Progress Description|ST|1||
00741007|ProcedureStepProgressParametersSequence|Procedure Step Progress Parameters Sequence|SQ|1||
00741008|ProcedureStepCommunicationsURISequence|Procedure Step Communications URI Sequence|SQ|1||
0074100A|ContactURI|Contact URI|UR|1||
0074100C|ContactDisplayName|Contact Display Name|LO|1||
0074100E|ProcedureStepDiscontinuationReasonCodeSequence|Procedure Step Discontinuation Reason Code Sequence|SQ|1||
00741020|BeamTaskSequence|Beam Task Sequence|SQ|1||
00741022|BeamTaskType|Beam Task Type|CS|1||
00741024|BeamOrderIndexTrial|Beam Order Index (Trial)|IS|1|R|
00741025|AutosequenceFlag|Autosequence Flag|CS|1||
00741026|TableTopVerticalAdjustedPosition|Table Top Vertical Adjusted Position|FD|1||
00741027|TableTopLongitudinalAdjustedPosition|Table Top Longitudinal Adjusted Position|FD|1||
00741028|TableTopLateralAdjustedPosition|Table Top Lateral Adjusted Position|FD|1||
0074102A|PatientSupportAdjustedAngle|Patient Support Adjusted Angle|FD|1||
0074102B|TableTopEccentricAdjustedAngle|Table Top Eccentric Adjusted Angle|FD|1||
0074102C|TableTopPitchAdjustedAngle|Table Top Pitch Adjusted Angle|FD|1||
0074102D|TableTopRollAdjustedAngle|Table Top Roll Adjusted Angle|FD|1||
00741030|DeliveryVerificationImageSequence|Delivery Verification Image Sequence|SQ|1||
00741032|VerificationImageTiming|Verification Image Timing|CS|1||
00741034|DoubleExposureFlag|Double Exposure Flag|CS|1||
00741036|DoubleExposureOrdering|Double Exposure Ordering|CS|1||
00741038|DoubleExposureMetersetTrial|Double Exposure Meterset (Trial)|DS|1|R|
0074103A|DoubleExposureFieldDeltaTrial|Double Exposure Field Delta (Trial)|DS|4|R|
00741040|RelatedReferenceRTImageSequence|Related Reference RT Image Sequence|SQ|1||
00741042|GeneralMachineVerificationSequence|General Machine Verification Sequence|SQ|1||
00741044|ConventionalMachineVerificationSequence|Conventional Machine Verification Sequence|SQ|1||
00741046|IonMachineVerificationSequence|Ion Machine Verification Sequence|SQ|1||
00741048|FailedAttributesSequence|Failed Attributes Sequence|SQ|1||
0074104A|OverriddenAttributesSequence|Overridden Attributes Sequence|SQ|1||
0074104C|ConventionalControlPointVerificationSequence|Conventional Control Point Verification Sequence|SQ|1||
0074104E|IonControlPointVerificationSequence|Ion Control Point Verification Sequence|SQ|1||
00741050|AttributeOccurrenceSequence|Attribute Occurrence Sequence|SQ|1||
00741052|AttributeOccurrencePointer|Attribute Occurrence Pointer|AT|1||
00741054|AttributeItemSelector|Attribute Item Selector|UL|1||
00741056|AttributeOccurrencePrivateCreator|Attribute Occurrence Private Creator|LO|1||
00741057|SelectorSequencePointerItems|Selector Sequence Pointer Items|IS|1-n||
00741200|ScheduledProcedureStepPriority|Scheduled Procedure Step Priority|CS|1||
00741202|WorklistLabel|Worklist Label|LO|1||
00741204|ProcedureStepLabel|Procedure Step Label|LO|1||
00741210|ScheduledProcessingParametersSequence|Scheduled Processing Parameters Sequence|SQ|1||
00741212|PerformedProcessingParametersSequence|Performed Processing Parameters Sequence|SQ|1||
00741216|UnifiedProcedureStepPerformedProcedureSequence|Unified Procedure Step Performed Procedure Sequence|SQ|1||
00741220|RelatedProcedureStepSequence|Related Procedure Step Sequence|SQ|1|R|
00741222|ProcedureStepRelationshipType|Procedure Step Relationship Type|LO|1|R|
00741224|ReplacedProcedureStepSequence|Replaced Procedure Step Sequence|SQ|1||
00741230|DeletionLock|Deletion Lock|LO|1||
00741234|ReceivingAE|Receiving AE|AE|1||
00741236|RequestingAE|Requesting AE|AE|1||
00741238|ReasonForCancellation|Reason for Cancellation|LT|1||
00741242|SCPStatus|SCP Status|CS|1||
00741244|SubscriptionListStatus|Subscription List Status|CS|1||
00741246|UnifiedProcedureStepListStatus|Unified Procedure Step List Status|CS|1||
00741324|BeamOrderIndex|Beam Order Index|UL|1||
00741338|DoubleExposureMeterset|Double Exposure Meterset|FD|1||
0074133A|DoubleExposureFieldDelta|Double Exposure Field Delta|FD|4||
00741401|BrachyTaskSequence|Brachy Task Sequence|SQ|1||
00741402|ContinuationStartTotalReferenceAirKerma|Continuation Start Total Reference Air Kerma|DS|1||
00741403|ContinuationEndTotalReferenceAirKerma|Continuation End Total Reference Air Kerma|DS|1||
00741404|ContinuationPulseNumber|Continuation Pulse Number|IS|1||
00741405|ChannelDeliveryOrderSequence|Channel Delivery Order Sequence|SQ|1||
00741406|ReferencedChannelNumber|Referenced Channel Number|IS|1||
00741407|StartCumulativeTimeWeight|Start Cumulative Time Weight|DS|1||
00741408|EndCumulativeTimeWeight|End Cumulative Time Weight|DS|1||
00741409|OmittedChannelSequence|Omitted Channel Sequence|SQ|1||
0074140A|ReasonForChannelOmission|Reason for Channel Omission|CS|1||
0074140B|ReasonForChannelOmissionDescription|Reason for Channel Omission Description|LO|1||
0074140C|ChannelDeliveryOrderIndex|Channel Delivery Order Index|IS|1||
0074140D|ChannelDeliveryContinuationSequence|Channel Delivery Continuation Sequence|SQ|1||
0074140E|OmittedApplicationSetupSequence|Omitted Application Setup Sequence|SQ|1||
00760001|ImplantAssemblyTemplateName|Implant Assembly Template Name|LO|1||
00760003|ImplantAssemblyTemplateIssuer|Implant Assembly Template Issuer|LO|1||
00760006|ImplantAssemblyTemplateVersion|Implant Assembly Template Version|LO|1||
00760008|ReplacedImplantAssemblyTemplateSequence|Replaced Implant Assembly Template Sequence|SQ|1||
0076000A|ImplantAssemblyTemplateType|Implant Assembly Template Type|CS|1||
0076000C|OriginalImplantAssemblyTemplateSequence|Original Implant Assembly Template Sequence|SQ|1||
0076000E|DerivationImplantAssemblyTemplateSequence|Derivation Implant Assembly Template Sequence|SQ|1||
00760010|ImplantAssemblyTemplateTargetAnatomySequence|Implant Assembly Template Target Anatomy Sequence|SQ|1||
00760020|ProcedureTypeCodeSequence|Procedure Type Code Sequence|SQ|1||
00760030|SurgicalTechnique|Surgical Technique|LO|1||
00760032|ComponentTypesSequence|Component Types Sequence|SQ|1||
00760034|ComponentTypeCodeSequence|Component Type Code Sequence|SQ|1||
00760036|ExclusiveComponentType|Exclusive Component Type|CS|1||
00760038|MandatoryComponentType|Mandatory Component Type|CS|1||
00760040|ComponentSequence|Component Sequence|SQ|1||
00760055|ComponentID|Component ID|US|1||
00760060|ComponentAssemblySequence|Component Assembly Sequence|SQ|1||
00760070|Component1ReferencedID|Component 1 Referenced ID|US|1||
00760080|Component1ReferencedMatingFeatureSetID|Component 1 Referenced Mating Feature Set ID|US|1||
00760090|Component1ReferencedMatingFeatureID|Component 1 Referenced Mating Feature ID|US|1||
007600A0|Component2ReferencedID|Component 2 Referenced ID|US|1||
007600B0|Component2ReferencedMatingFeatureSetID|Component 2 Referenced Mating Feature Set ID|US|1||
007600C0|Component2ReferencedMatingFeatureID|Component 2 Referenced Mating Feature ID|US|1||
00780001|ImplantTemplateGroupName|Implant Template Group Name|LO|1||
00780010|ImplantTemplateGroupDescription|Implant Template Group Description|ST|1||
00780020|ImplantTemplateGroupIssuer|Implant Template Group Issuer|LO|1||
00780024|ImplantTemplateGroupVersion|Implant Template Group Version|LO|1||
00780026|ReplacedImplantTemplateGroupSequence|Replaced Implant Template Group Sequence|SQ|1||
00780028|ImplantTemplateGroupTargetAnatomySequence|Implant Template Group Target Anatomy Sequence|SQ|1||
0078002A|ImplantTemplateGroupMembersSequence|Implant Template Group Members Sequence|SQ|1||
0078002E|ImplantTemplateGroupMemberID|Implant Template Group Member ID|US|1||
00780050|ThreeDImplantTemplateGroupMemberMatchingPoint|3D Implant Template Group Member Matching Point|FD|3||
00780060|ThreeDImplantTemplateGroupMemberMatchingAxes|3D Implant Template Group Member Matching Axes|FD|9||
00780070|ImplantTemplateGroupMemberMatching2DCoordinatesSequence|Implant Template Group Member Matching 2D Coordinates Sequence|SQ|1||
00780090|TwoDImplantTemplateGroupMemberMatchingPoint|2D Implant Template Group Member Matching Point|FD|2||
007800A0|TwoDImplantTemplateGroupMemberMatchingAxes|2D Implant Template Group Member Matching Axes|FD|4||
007800B0|ImplantTemplateGroupVariationDimensionSequence|Implant Template Group Variation Dimension Sequence|SQ|1||
007800B2|ImplantTemplateGroupVariationDimensionName|Implant Template Group Variation Dimension Name|LO|1||
007800B4|ImplantTemplateGroupVariationDimensionRankSequence|Implant Template Group Variation Dimension Rank Sequence|SQ|1||
007800B6|ReferencedImplantTemplateGroupMemberID|Referenced Implant Template Group Member ID|US|1||
007800B8|ImplantTemplateGroupVariationDimensionRank|Implant Template Group Variation Dimension Rank|US|1||
00800001|SurfaceScanAcquisitionTypeCodeSequence|Surface Scan Acquisition Type Code Sequence|SQ|1||
00800002|SurfaceScanModeCodeSequence|Surface Scan Mode Code Sequence|SQ|1||
00800003|RegistrationMethodCodeSequence|Registration Method Code Sequence|SQ|1||
00800004|ShotDurationTime|Shot Duration Time|FD|1||
00800005|ShotOffsetTime|Shot Offset Time|FD|1||
00800006|SurfacePointPresentationValueData|Surface Point Presentation Value Data|US|1-n||
00800007|SurfacePointColorCIELabValueData|Surface Point Color CIELab Value Data|US|3-3n||
00800008|UVMappingSequence|UV Mapping Sequence|SQ|1||
00800009|TextureLabel|Texture Label|SH|1||
00800010|UValueData|U Value Data|OF|1||
00800011|VValueData|V Value Data|OF|1||
00800012|ReferencedTextureSequence|Referenced Texture Sequence|SQ|1||
00800013|ReferencedSurfaceDataSequence|Referenced Surface Data Sequence|SQ|1||
00820001|AssessmentSummary|Assessment Summary|CS|1||
00820003|AssessmentSummaryDescription|Assessment Summary Description|UT|1||
00820004|AssessedSOPInstanceSequence|Assessed SOP Instance Sequence|SQ|1||
00820005|ReferencedComparisonSOPInstanceSequence|Referenced Comparison SOP Instance Sequence|SQ|1||
00820006|NumberOfAssessmentObservations|Number of Assessment Observations|UL|1||
00820007|AssessmentObservationsSequence|Assessment Observations Sequence|SQ|1||
00820008|ObservationSignificance|Observation Significance|CS|1||
0082000A|ObservationDescription|Observation Description|UT|1||
0082000C|StructuredConstraintObservationSequence|Structured Constraint Observation Sequence|SQ|1||
00820010|AssessedAttributeValueSequence|Assessed Attribute Value Sequence|SQ|1||
00820016|AssessmentSetID|Assessment Set ID|LO|1||
00820017|AssessmentRequesterSequence|Assessment Requester Sequence|SQ|1||
00820018|SelectorAttributeName|Selector Attribute Name|LO|1||
00820019|SelectorAttributeKeyword|Selector Attribute Keyword|LO|1||
00820021|AssessmentTypeCodeSequence|Assessment Type Code Sequence|SQ|1||
00820022|ObservationBasisCodeSequence|Observation Basis Code Sequence|SQ|1||
00820023|AssessmentLabel|Assessment Label|LO|1||
00820032|ConstraintType|Constraint Type|CS|1||
00820033|SpecificationSelectionGuidance|Specification Selection Guidance|UT|1||
00820034|ConstraintValueSequence|Constraint Value Sequence|SQ|1||
00820035|RecommendedDefaultValueSequence|Recommended Default Value Sequence|SQ|1||
00820036|ConstraintViolationSignificance|Constraint Violation Significance|CS|1||
00820037|ConstraintViolationCondition|Constraint Violation Condition|UT|1||
00820038|ModifiableConstraintFlag|Modifiable Constraint Flag|CS|1||
00880130|StorageMediaFileSetID|Storage Media File-set ID|SH|1||
00880140|StorageMediaFileSetUID|Storage Media File-set UID|UI|1||
00880200|IconImageSequence|Icon Image Sequence|SQ|1||
00880904|TopicTitle|Topic Title|LO|1|R|
00880906|TopicSubject|Topic Subject|ST|1|R|
00880910|TopicAuthor|Topic Author|LO|1|R|
00880912|TopicKeywords|Topic Keywords|LO|1-32|R|
01000410|SOPInstanceStatus|SOP Instance Status|CS|1||
01000420|SOPAuthorizationDateTime|SOP Authorization DateTime|DT|1||
01000424|SOPAuthorizationComment|SOP Authorization Comment|LT|1||
01000426|AuthorizationEquipmentCertificationNumber|Authorization Equipment Certification Number|LO|1||
04000005|MACIDNumber|MAC ID Number|US|1||
04000010|MACCalculationTransferSyntaxUID|MAC Calculation Transfer Syntax UID|UI|1||
04000015|MACAlgorithm|MAC Algorithm|CS|1||
04000020|DataElementsSigned|Data Elements Signed|AT|1-n||
04000100|DigitalSignatureUID|Digital Signature UID|UI|1||
04000105|DigitalSignatureDateTime|Digital Signature DateTime|DT|1||
04000110|CertificateType|Certificate Type|CS|1||
04000115|CertificateOfSigner|Certificate of Signer|OB|1||
04000120|Signature|Signature|OB|1||
04000305|CertifiedTimestampType|Certified Timestamp Type|CS|1||
04000310|CertifiedTimestamp|Certified Timestamp|OB|1||
04000315|||FL|1|R|
04000401|DigitalSignaturePurposeCodeSequence|Digital Signature Purpose Code Sequence|SQ|1||
04000402|ReferencedDigitalSignatureSequence|Referenced Digital Signature Sequence|SQ|1||
04000403|ReferencedSOPInstanceMACSequence|Referenced SOP Instance MAC Sequence|SQ|1||
04000404|MAC|MAC|OB|1||
04000500|EncryptedAttributesSequence|Encrypted Attributes Sequence|SQ|1||
04000510|EncryptedContentTransferSyntaxUID|Encrypted Content Transfer Syntax UID|UI|1||
04000520|EncryptedContent|Encrypted Content|OB|1||
04000550|ModifiedAttributesSequence|Modified Attributes Sequence|SQ|1||
04000551|NonconformingModifiedAttributesSequence|Nonconforming Modified Attributes Sequence|SQ|1||
04000552|NonconformingDataElementValue|Nonconforming Data Element Value|OB|1||
04000561|OriginalAttributesSequence|Original Attributes Sequence|SQ|1||
04000562|AttributeModificationDateTime|Attribute Modification DateTime|DT|1||
04000563|ModifyingSystem|Modifying System|LO|1||
04000564|SourceOfPreviousValues|Source of Previous Values|LO|1||
04000565|ReasonForTheAttributeModification|Reason for the Attribute Modification|CS|1||
04000600|InstanceOriginStatus|Instance Origin Status|CS|1||
1000xxx0|EscapeTriplet|Escape Triplet|US|3|R|x
1000xxx1|RunLengthTriplet|Run Length Triplet|US|3|R|x
1000xxx2|HuffmanTableSize|Huffman Table Size|US|1|R|x
1000xxx3|HuffmanTableTriplet|Huffman Table Triplet|US|3|R|x
1000xxx4|ShiftTableSize|Shift Table Size|US|1|R|x
1000xxx5|ShiftTableTriplet|Shift Table Triplet|US|3|R|x
1010xxxx|ZonalMap|Zonal Map|US|1-n|R|x
20000010|NumberOfCopies|Number of Copies|IS|1||
2000001E|PrinterConfigurationSequence|Printer Configuration Sequence|SQ|1||
20000020|PrintPriority|Print Priority|CS|1||
20000030|MediumType|Medium Type|CS|1||
20000040|FilmDestination|Film Destination|CS|1||
20000050|FilmSessionLabel|Film Session Label|LO|1||
20000060|MemoryAllocation|Memory Allocation|IS|1||
20000061|MaximumMemoryAllocation|Maximum Memory Allocation|IS|1||
20000062|ColorImagePrintingFlag|Color Image Printing Flag|CS|1|R|
20000063|CollationFlag|Collation Flag|CS|1|R|
20000065|AnnotationFlag|Annotation Flag|CS|1|R|
20000067|ImageOverlayFlag|Image Overlay Flag|CS|1|R|
20000069|PresentationLUTFlag|Presentation LUT Flag|CS|1|R|
2000006A|ImageBoxPresentationLUTFlag|Image Box Presentation LUT Flag|CS|1|R|
200000A0|MemoryBitDepth|Memory Bit Depth|US|1||
200000A1|PrintingBitDepth|Printing Bit Depth|US|1||
200000A2|MediaInstalledSequence|Media Installed Sequence|SQ|1||
200000A4|OtherMediaAvailableSequence|Other Media Available Sequence|SQ|1||
200000A8|SupportedImageDisplayFormatsSequence|Supported Image Display Formats Sequence|SQ|1||
20000500|ReferencedFilmBoxSequence|Referenced Film Box Sequence|SQ|1||
20000510|ReferencedStoredPrintSequence|Referenced Stored Print Sequence|SQ|1|R|
20100010|ImageDisplayFormat|Image Display Format|ST|1||
20100030|AnnotationDisplayFormatID|Annotation Display Format ID|CS|1||
20100040|FilmOrientation|Film Orientation|CS|1||
20100050|FilmSizeID|Film Size ID|CS|1||
20100052|PrinterResolutionID|Printer Resolution ID|CS|1||
20100054|DefaultPrinterResolutionID|Default Printer Resolution ID|CS|1||
20100060|MagnificationType|Magnification Type|CS|1||
20100080|SmoothingType|Smoothing Type|CS|1||
201000A6|DefaultMagnificationType|Default Magnification Type|CS|1||
201000A7|OtherMagnificationTypesAvailable|Other Magnification Types Available|CS|1-n||
201000A8|DefaultSmoothingType|Default Smoothing Type|CS|1||
201000A9|OtherSmoothingTypesAvailable|Other Smoothing Types Available|CS|1-n||
20100100|BorderDensity|Border Density|CS|1||
20100110|EmptyImageDensity|Empty Image Density|CS|1||
20100120|MinDensity|Min Density|US|1||
20100130|MaxDensity|Max Density|US|1||
20100140|Trim|Trim|CS|1||
20100150|ConfigurationInformation|Configuration Information|ST|1||
20100152|ConfigurationInformationDescription|Configuration Information Description|LT|1||
20100154|MaximumCollatedFilms|Maximum Collated Films|IS|1||
2010015E|Illumination|Illumination|US|1||
20100160|ReflectedAmbientLight|Reflected Ambient Light|US|1||
20100376|PrinterPixelSpacing|Printer Pixel Spacing|DS|2||
20100500|ReferencedFilmSessionSequence|Referenced Film Session Sequence|SQ|1||
20100510|ReferencedImageBoxSequence|Referenced Image Box Sequence|SQ|1||
20100520|ReferencedBasicAnnotationBoxSequence|Referenced Basic Annotation Box Sequence|SQ|1||
20200010|ImageBoxPosition|Image Box Position|US|1||
20200020|Polarity|Polarity|CS|1||
20200030|RequestedImageSize|Requested Image Size|DS|1||
20200040|RequestedDecimateCropBehavior|Requested Decimate/Crop Behavior|CS|1||
20200050|RequestedResolutionID|Requested Resolution ID|CS|1||
202000A0|RequestedImageSizeFlag|Requested Image Size Flag|CS|1||
202000A2|DecimateCropResult|Decimate/Crop Result|CS|1||
20200110|BasicGrayscaleImageSequence|Basic Grayscale Image Sequence|SQ|1||
20200111|BasicColorImageSequence|Basic Color Image Sequence|SQ|1||
20200130|ReferencedImageOverlayBoxSequence|Referenced Image Overlay Box Sequence|SQ|1|R|
20200140|ReferencedVOILUTBoxSequence|Referenced VOI LUT Box Sequence|SQ|1|R|
20300010|AnnotationPosition|Annotation Position|US|1||
20300020|TextString|Text String|LO|1||
20400010|ReferencedOverlayPlaneSequence|Referenced Overlay Plane Sequence|SQ|1|R|
20400011|ReferencedOverlayPlaneGroups|Referenced Overlay Plane Groups|US|1-99|R|
20400020|OverlayPixelDataSequence|Overlay Pixel Data Sequence|SQ|1|R|
20400060|OverlayMagnificationType|Overlay Magnification Type|CS|1|R|
20400070|OverlaySmoothingType|Overlay Smoothing Type|CS|1|R|
20400072|OverlayOrImageMagnification|Overlay or Image Magnification|CS|1|R|
20400074|MagnifyToNumberOfColumns|Magnify to Number of Columns|US|1|R|
20400080|OverlayForegroundDensity|Overlay Foreground Density|CS|1|R|
20400082|OverlayBackgroundDensity|Overlay Background Density|CS|1|R|
20400090|OverlayMode|Overlay Mode|CS|1|R|
20400100|ThresholdDensity|Threshold Density|CS|1|R|
20400500|ReferencedImageBoxSequenceRetired|Referenced Image Box Sequence (Retired)|SQ|1|R|
20500010|PresentationLUTSequence|Presentation LUT Sequence|SQ|1||
20500020|PresentationLUTShape|Presentation LUT Shape|CS|1||
20500500|ReferencedPresentationLUTSequence|Referenced Presentation LUT Sequence|SQ|1||
21000010|PrintJobID|Print Job ID|SH|1|R|
21000020|ExecutionStatus|Execution Status|CS|1||
21000030|ExecutionStatusInfo|Execution Status Info|CS|1||
21000040|CreationDate|Creation Date|DA|1||
21000050|CreationTime|Creation Time|TM|1||
21000070|Originator|Originator|AE|1||
21000140|DestinationAE|Destination AE|AE|1||
21000160|OwnerID|Owner ID|SH|1||
21000170|NumberOfFilms|Number of Films|IS|1||
21000500|ReferencedPrintJobSequencePullStoredPrint|Referenced Print Job Sequence (Pull Stored Print)|SQ|1|R|
21100010|PrinterStatus|Printer Status|CS|1||
21100020|PrinterStatusInfo|Printer Status Info|CS|1||
21100030|PrinterName|Printer Name|LO|1||
21100099|PrintQueueID|Print Queue ID|SH|1|R|
21200010|QueueStatus|Queue Status|CS|1|R|
21200050|PrintJobDescriptionSequence|Print Job Description Sequence|SQ|1|R|
21200070|ReferencedPrintJobSequence|Referenced Print Job Sequence|SQ|1|R|
21300010|PrintManagementCapabilitiesSequence|Print Management Capabilities Sequence|SQ|1|R|
21300015|PrinterCharacteristicsSequence|Printer Characteristics Sequence|SQ|1|R|
21300030|FilmBoxContentSequence|Film Box Content Sequence|SQ|1|R|
21300040|ImageBoxContentSequence|Image Box Content Sequence|SQ|1|R|
21300050|AnnotationContentSequence|Annotation Content Sequence|SQ|1|R|
21300060|ImageOverlayBoxContentSequence|Image Overlay Box Content Sequence|SQ|1|R|
21300080|PresentationLUTContentSequence|Presentation LUT Content Sequence|SQ|1|R|
213000A0|ProposedStudySequence|Proposed Study Sequence|SQ|1||
213000C0|OriginalImageSequence|Original Image Sequence|SQ|1||
22000001|LabelUsingInformationExtractedFromInstances|Label Using Information Extracted From Instances|CS|1||
22000002|LabelText|Label Text|UT|1||
22000003|LabelStyleSelection|Label Style Selection|CS|1||
22000004|MediaDisposition|Media Disposition|LT|1||
22000005|BarcodeValue|Barcode Value|LT|1||
22000006|BarcodeSymbology|Barcode Symbology|CS|1||
22000007|AllowMediaSplitting|Allow Media Splitting|CS|1||
22000008|IncludeNonDICOMObjects|Include Non-DICOM Objects|CS|1||
22000009|IncludeDisplayApplication|Include Display Application|CS|1||
2200000A|PreserveCompositeInstancesAfterMediaCreation|Preserve Composite Instances After Media Creation|CS|1||
2200000B|TotalNumberOfPiecesOfMediaCreated|Total Number of Pieces of Media Created|US|1||
2200000C|RequestedMediaApplicationProfile|Requested Media Application Profile|LO|1||
2200000D|ReferencedStorageMediaSequence|Referenced Storage Media Sequence|SQ|1||
2200000E|FailureAttributes|Failure Attributes|AT|1-n||
2200000F|AllowLossyCompression|Allow Lossy Compression|CS|1||
22000020|RequestPriority|Request Priority|CS|1||
30020002|RTImageLabel|RT Image Label|SH|1||
30020003|RTImageName|RT Image Name|LO|1||
30020004|RTImageDescription|RT Image Description|ST|1||
3002000A|ReportedValuesOrigin|Reported Values Origin|CS|1||
3002000C|RTImagePlane|RT Image Plane|CS|1||
3002000D|XRayImageReceptorTranslation|X-Ray Image Receptor Translation|DS|3||
3002000E|XRayImageReceptorAngle|X-Ray Image Receptor Angle|DS|1||
30020010|RTImageOrientation|RT Image Orientation|DS|6||
30020011|ImagePlanePixelSpacing|Image Plane Pixel Spacing|DS|2||
30020012|RTImagePosition|RT Image Position|DS|2||
30020020|RadiationMachineName|Radiation Machine Name|SH|1||
30020022|RadiationMachineSAD|Radiation Machine SAD|DS|1||
30020024|RadiationMachineSSD|Radiation Machine SSD|DS|1||
30020026|RTImageSID|RT Image SID|DS|1||
30020028|SourceToReferenceObjectDistance|Source to Reference Object Distance|DS|1||
30020029|FractionNumber|Fraction Number|IS|1||
30020030|ExposureSequence|Exposure Sequence|SQ|1||
30020032|MetersetExposure|Meterset Exposure|DS|1||
30020034|DiaphragmPosition|Diaphragm Position|DS|4||
30020040|FluenceMapSequence|Fluence Map Sequence|SQ|1||
30020041|FluenceDataSource|Fluence Data Source|CS|1||
30020042|FluenceDataScale|Fluence Data Scale|DS|1||
30020050|PrimaryFluenceModeSequence|Primary Fluence Mode Sequence|SQ|1||
30020051|FluenceMode|Fluence Mode|CS|1||
30020052|FluenceModeID|Fluence Mode ID|SH|1||
30020100|SelectedFrameNumber|Selected Frame Number|IS|1||
30020101|SelectedFrameFunctionalGroupsSequence|Selected Frame Functional Groups Sequence|SQ|1||
30020102|RTImageFrameGeneralContentSequence|RT Image Frame General Content Sequence|SQ|1||
30020103|RTImageFrameContextSequence|RT Image Frame Context Sequence|SQ|1||
30020104|RTImageScopeSequence|RT Image Scope Sequence|SQ|1||
30020105|BeamModifierCoordinatesPresenceFlag|Beam Modifier Coordinates Presence Flag|CS|1||
30020106|StartCumulativeMeterset|Start Cumulative Meterset|FD|1||
30020107|StopCumulativeMeterset|Stop Cumulative Meterset|FD|1||
30020108|RTAcquisitionPatientPositionSequence|RT Acquisition Patient Position Sequence|SQ|1||
30020109|RTImageFrameImagingDevicePositionSequence|RT Image Frame Imaging Device Position Sequence|SQ|1||
3002010A|RTImageFramekVRadiationAcquisitionSequence|RT Image Frame kV Radiation Acquisition Sequence|SQ|1||
3002010B|RTImageFrameMVRadiationAcquisitionSequence|RT Image Frame MV Radiation Acquisition Sequence|SQ|1||
3002010C|RTImageFrameRadiationAcquisitionSequence|RT Image Frame Radiation Acquisition Sequence|SQ|1||
3002010D|ImagingSourcePositionSequence|Imaging Source Position Sequence|SQ|1||
3002010E|ImageReceptorPositionSequence|Image Receptor Position Sequence|SQ|1||
3002010F|DevicePositionToEquipmentMappingMatrix|Device Position to Equipment Mapping Matrix|FD|16||
30020110|DevicePositionParameterSequence|Device Position Parameter Sequence|SQ|1||
30020111|ImagingSourceLocationSpecificationType|Imaging Source Location Specification Type|CS|1||
30020112|ImagingDeviceLocationMatrixSequence|Imaging Device Location Matrix Sequence|SQ|1||
30020113|ImagingDeviceLocationParameterSequence|Imaging Device Location Parameter Sequence|SQ|1||
30020114|ImagingApertureSequence|Imaging Aperture Sequence|SQ|1||
30020115|ImagingApertureSpecificationType|Imaging Aperture Specification Type|CS|1||
30020116|NumberOfAcquisitionDevices|Number of Acquisition Devices|US|1||
30020117|AcquisitionDeviceSequence|Acquisition Device Sequence|SQ|1||
30020118|AcquisitionTaskSequence|Acquisition Task Sequence|SQ|1||
30020119|AcquisitionTaskWorkitemCodeSequence|Acquisition Task Workitem Code Sequence|SQ|1||
3002011A|AcquisitionSubtaskSequence|Acquisition Subtask Sequence|SQ|1||
3002011B|SubtaskWorkitemCodeSequence|Subtask Workitem Code Sequence|SQ|1||
3002011C|AcquisitionTaskIndex|Acquisition Task Index|US|1||
3002011D|AcquisitionSubtaskIndex|Acquisition Subtask Index|US|1||
3002011E|ReferencedBaselineParametersRTRadiationInstanceSequence|Referenced Baseline Parameters RT Radiation Instance Sequence|SQ|1||
3002011F|PositionAcquisitionTemplateIdentificationSequence|Position Acquisition Template Identification Sequence|SQ|1||
30020120|PositionAcquisitionTemplateID|Position Acquisition Template ID|ST|1||
30020121|PositionAcquisitionTemplateName|Position Acquisition Template Name|LO|1||
30020122|PositionAcquisitionTemplateCodeSequence|Position Acquisition Template Code Sequence|SQ|1||
30020123|PositionAcquisitionTemplateDescription|Position Acquisition Template Description|LT|1||
30020124|AcquisitionTaskApplicabilitySequence|Acquisition Task Applicability Sequence|SQ|1||
30020125|ProjectionImagingAcquisitionParameterSequence|Projection Imaging Acquisition Parameter Sequence|SQ|1||
30020126|CTImagingAcquisitionParameterSequence|CT Imaging Acquisition Parameter Sequence|SQ|1||
30020127|KVImagingGenerationParametersSequence|KV Imaging Generation Parameters Sequence|SQ|1||
30020128|MVImagingGenerationParametersSequence|MV Imaging Generation Parameters Sequence|SQ|1||
30020129|AcquisitionSignalType|Acquisition Signal Type|CS|1||
3002012A|AcquisitionMethod|Acquisition Method|CS|1||
3002012B|ScanStartPositionSequence|Scan Start Position Sequence|SQ|1||
3002012C|ScanStopPositionSequence|Scan Stop Position Sequence|SQ|1||
3002012D|ImagingSourceToBeamModifierDefinitionPlaneDistance|Imaging Source to Beam Modifier Definition Plane Distance|FD|1||
3002012E|ScanArcType|Scan Arc Type|CS|1||
3002012F|DetectorPositioningType|Detector Positioning Type|CS|1||
30020130|AdditionalRTAccessoryDeviceSequence|Additional RT Accessory Device Sequence|SQ|1||
30020131|DeviceSpecificAcquisitionParameterSequence|Device-Specific Acquisition Parameter Sequence|SQ|1||
30020132|ReferencedPositionReferenceInstanceSequence|Referenced Position Reference Instance Sequence|SQ|1||
30020133|EnergyDerivationCodeSequence|Energy Derivation Code Sequence|SQ|1||
30020134|MaximumCumulativeMetersetExposure|Maximum Cumulative Meterset Exposure|FD|1||
30020135|AcquisitionInitiationSequence|Acquisition Initiation Sequence|SQ|1||
30020136|RTConeBeamImagingGeometrySequence|RT Cone-Beam Imaging Geometry Sequence|SQ|1||
30040001|DVHType|DVH Type|CS|1||
30040002|DoseUnits|Dose Units|CS|1||
30040004|DoseType|Dose Type|CS|1||
30040005|SpatialTransformOfDose|Spatial Transform of Dose|CS|1||
30040006|DoseComment|Dose Comment|LO|1||
30040008|NormalizationPoint|Normalization Point|DS|3||
3004000A|DoseSummationType|Dose Summation Type|CS|1||
3004000C|GridFrameOffsetVector|Grid Frame Offset Vector|DS|2-n||
3004000E|DoseGridScaling|Dose Grid Scaling|DS|1||
30040010|RTDoseROISequence|RT Dose ROI Sequence|SQ|1|R|
30040012|DoseValue|Dose Value|DS|1||
30040014|TissueHeterogeneityCorrection|Tissue Heterogeneity Correction|CS|1-3||
30040016|RecommendedIsodoseLevelSequence|Recommended Isodose Level Sequence|SQ|1||
30040020|DoseUnitCodeSequence|Dose Unit Code Sequence|SQ|1||
30040021|RTDoseInterpretedTypeCodeSequence|RT Dose Interpreted Type Code Sequence|SQ|1||
30040022|RTDoseInterpretedTypeCodeModifierSequence|RT Dose Interpreted Type Code Modifier Sequence|SQ|1||
30040023|DoseRadiobiologicalInterpretationSequence|Dose Radiobiological Interpretation Sequence|SQ|1||
30040024|RTDoseIntentCodeSequence|RT Dose Intent Code Sequence|SQ|1||
30040040|DVHNormalizationPoint|DVH Normalization Point|DS|3||
30040042|DVHNormalizationDoseValue|DVH Normalization Dose Value|DS|1||
30040050|DVHSequence|DVH Sequence|SQ|1||
30040052|DVHDoseScaling|DVH Dose Scaling|DS|1||
30040054|DVHVolumeUnits|DVH Volume Units|CS|1||
30040056|DVHNumberOfBins|DVH Number of Bins|IS|1||
30040058|DVHData|DVH Data|DS|2-2n||
30040060|DVHReferencedROISequence|DVH Referenced ROI Sequence|SQ|1||
30040062|DVHROIContributionType|DVH ROI Contribution Type|CS|1||
30040070|DVHMinimumDose|DVH Minimum Dose|DS|1||
30040072|DVHMaximumDose|DVH Maximum Dose|DS|1||
30040074|DVHMeanDose|DVH Mean Dose|DS|1||
3004007F|DoseCalculationModelName|Dose Calculation Model Name|LO|1||
30040080|DoseCalculationModelSequence|Dose Calculation Model Sequence|SQ|1||
30040081|DoseCalculationAlgorithmSequence|Dose Calculation Algorithm Sequence|SQ|1||
30040082|CommissioningStatus|Commissioning Status|CS|1||
30040083|DoseCalculationModelParameterSequence|Dose Calculation Model Parameter Sequence|SQ|1||
30040084|DoseDepositionCalculationMedium|Dose Deposition Calculation Medium|CS|1||
30060002|StructureSetLabel|Structure Set Label|SH|1||
30060004|StructureSetName|Structure Set Name|LO|1||
30060006|StructureSetDescription|Structure Set Description|ST|1||
30060008|StructureSetDate|Structure Set Date|DA|1||
30060009|StructureSetTime|Structure Set Time|TM|1||
30060010|ReferencedFrameOfReferenceSequence|Referenced Frame of Reference Sequence|SQ|1||
30060012|RTReferencedStudySequence|RT Referenced Study Sequence|SQ|1||
30060014|RTReferencedSeriesSequence|RT Referenced Series Sequence|SQ|1||
30060016|ContourImageSequence|Contour Image Sequence|SQ|1||
30060018|PredecessorStructureSetSequence|Predecessor Structure Set Sequence|SQ|1||
30060020|StructureSetROISequence|Structure Set ROI Sequence|SQ|1||
30060022|ROINumber|ROI Number|IS|1||
30060024|ReferencedFrameOfReferenceUID|Referenced Frame of Reference UID|UI|1||
30060026|ROIName|ROI Name|LO|1||
30060028|ROIDescription|ROI Description|ST|1||
3006002A|ROIDisplayColor|ROI Display Color|IS|3||
3006002C|ROIVolume|ROI Volume|DS|1||
3006002D|ROIDateTime|ROI DateTime|DT|1||
3006002E|ROIObservationDateTime|ROI Observation DateTime|DT|1||
30060030|RTRelatedROISequence|RT Related ROI Sequence|SQ|1||
30060033|RTROIRelationship|RT ROI Relationship|CS|1||
30060036|ROIGenerationAlgorithm|ROI Generation Algorithm|CS|1||
30060037|ROIDerivationAlgorithmIdentificationSequence|ROI Derivation Algorithm Identification Sequence|SQ|1||
30060038|ROIGenerationDescription|ROI Generation Description|LO|1||
30060039|ROIContourSequence|ROI Contour Sequence|SQ|1||
30060040|ContourSequence|Contour Sequence|SQ|1||
30060042|ContourGeometricType|Contour Geometric Type|CS|1||
30060044|ContourSlabThickness|Contour Slab Thickness|DS|1|R|
30060045|ContourOffsetVector|Contour Offset Vector|DS|3|R|
30060046|NumberOfContourPoints|Number of Contour Points|IS|1||
30060048|ContourNumber|Contour Number|IS|1||
30060049|AttachedContours|Attached Contours|IS|1-n|R|
3006004A|SourcePixelPlanesCharacteristicsSequence|Source Pixel Planes Characteristics Sequence|SQ|1||
3006004B|SourceSeriesSequence|Source Series Sequence|SQ|1||
3006004C|SourceSeriesInformationSequence|Source Series Information Sequence|SQ|1||
3006004D|ROICreatorSequence|ROI Creator Sequence|SQ|1||
3006004E|ROIInterpreterSequence|ROI Interpreter Sequence|SQ|1||
3006004F|ROIObservationContextCodeSequence|ROI Observation Context Code Sequence|SQ|1||
30060050|ContourData|Contour Data|DS|3-3n||
30060080|RTROIObservationsSequence|RT ROI Observations Sequence|SQ|1||
30060082|ObservationNumber|Observation Number|IS|1||
30060084|ReferencedROINumber|Referenced ROI Number|IS|1||
30060085|ROIObservationLabel|ROI Observation Label|SH|1|R|
30060086|RTROIIdentificationCodeSequence|RT ROI Identification Code Sequence|SQ|1||
30060088|ROIObservationDescription|ROI Observation Description|ST|1|R|
300600A0|RelatedRTROIObservationsSequence|Related RT ROI Observations Sequence|SQ|1||
300600A4|RTROIInterpretedType|RT ROI Interpreted Type|CS|1||
300600A6|ROIInterpreter|ROI Interpreter|PN|1||
300600B0|ROIPhysicalPropertiesSequence|ROI Physical Properties Sequence|SQ|1||
300600B2|ROIPhysicalProperty|ROI Physical Property|CS|1||
300600B4|ROIPhysicalPropertyValue|ROI Physical Property Value|DS|1||
300600B6|ROIElementalCompositionSequence|ROI Elemental Composition Sequence|SQ|1||
300600B7|ROIElementalCompositionAtomicNumber|ROI Elemental Composition Atomic Number|US|1||
300600B8|ROIElementalCompositionAtomicMassFraction|ROI Elemental Composition Atomic Mass Fraction|FL|1||
300600B9|AdditionalRTROIIdentificationCodeSequence|Additional RT ROI Identification Code Sequence|SQ|1|R|
300600C0|FrameOfReferenceRelationshipSequence|Frame of Reference Relationship Sequence|SQ|1|R|
300600C2|RelatedFrameOfReferenceUID|Related Frame of Reference UID|UI|1|R|
300600C4|FrameOfReferenceTransformationType|Frame of Reference Transformation Type|CS|1|R|
300600C6|FrameOfReferenceTransformationMatrix|Frame of Reference Transformation Matrix|DS|16||
300600C8|FrameOfReferenceTransformationComment|Frame of Reference Transformation Comment|LO|1||
300600C9|PatientLocationCoordinatesSequence|Patient Location Coordinates Sequence|SQ|1||
300600CA|PatientLocationCoordinatesCodeSequence|Patient Location Coordinates Code Sequence|SQ|1||
300600CB|PatientSupportPositionSequence|Patient Support Position Sequence|SQ|1||
30080010|MeasuredDoseReferenceSequence|Measured Dose Reference Sequence|SQ|1||
30080012|MeasuredDoseDescription|Measured Dose Description|ST|1||
30080014|MeasuredDoseType|Measured Dose Type|CS|1||
30080016|MeasuredDoseValue|Measured Dose Value|DS|1||
30080020|TreatmentSessionBeamSequence|Treatment Session Beam Sequence|SQ|1||
30080021|TreatmentSessionIonBeamSequence|Treatment Session Ion Beam Sequence|SQ|1||
30080022|CurrentFractionNumber|Current Fraction Number|IS|1||
30080024|TreatmentControlPointDate|Treatment Control Point Date|DA|1||
30080025|TreatmentControlPointTime|Treatment Control Point Time|TM|1||
3008002A|TreatmentTerminationStatus|Treatment Termination Status|CS|1||
3008002B|TreatmentTerminationCode|Treatment Termination Code|SH|1|R|
3008002C|TreatmentVerificationStatus|Treatment Verification Status|CS|1||
30080030|ReferencedTreatmentRecordSequence|Referenced Treatment Record Sequence|SQ|1||
30080032|SpecifiedPrimaryMeterset|Specified Primary Meterset|DS|1||
30080033|SpecifiedSecondaryMeterset|Specified Secondary Meterset|DS|1||
30080036|DeliveredPrimaryMeterset|Delivered Primary Meterset|DS|1||
30080037|DeliveredSecondaryMeterset|Delivered Secondary Meterset|DS|1||
3008003A|SpecifiedTreatmentTime|Specified Treatment Time|DS|1||
3008003B|DeliveredTreatmentTime|Delivered Treatment Time|DS|1||
30080040|ControlPointDeliverySequence|Control Point Delivery Sequence|SQ|1||
30080041|IonControlPointDeliverySequence|Ion Control Point Delivery Sequence|SQ|1||
30080042|SpecifiedMeterset|Specified Meterset|DS|1||
30080044|DeliveredMeterset|Delivered Meterset|DS|1||
30080045|MetersetRateSet|Meterset Rate Set|FL|1||
30080046|MetersetRateDelivered|Meterset Rate Delivered|FL|1||
30080047|ScanSpotMetersetsDelivered|Scan Spot Metersets Delivered|FL|1-n||
30080048|DoseRateDelivered|Dose Rate Delivered|DS|1||
30080050|TreatmentSummaryCalculatedDoseReferenceSequence|Treatment Summary Calculated Dose Reference Sequence|SQ|1||
30080052|CumulativeDoseToDoseReference|Cumulative Dose to Dose Reference|DS|1||
30080054|FirstTreatmentDate|First Treatment Date|DA|1||
30080056|MostRecentTreatmentDate|Most Recent Treatment Date|DA|1||
3008005A|NumberOfFractionsDelivered|Number of Fractions Delivered|IS|1||
30080060|OverrideSequence|Override Sequence|SQ|1||
30080061|ParameterSequencePointer|Parameter Sequence Pointer|AT|1||
30080062|OverrideParameterPointer|Override Parameter Pointer|AT|1||
30080063|ParameterItemIndex|Parameter Item Index|IS|1||
30080064|MeasuredDoseReferenceNumber|Measured Dose Reference Number|IS|1||
30080065|ParameterPointer|Parameter Pointer|AT|1||
30080066|OverrideReason|Override Reason|ST|1||
30080067|ParameterValueNumber|Parameter Value Number|US|1||
30080068|CorrectedParameterSequence|Corrected Parameter Sequence|SQ|1||
3008006A|CorrectionValue|Correction Value|FL|1||
30080070|CalculatedDoseReferenceSequence|Calculated Dose Reference Sequence|SQ|1||
30080072|CalculatedDoseReferenceNumber|Calculated Dose Reference Number|IS|1||
30080074|CalculatedDoseReferenceDescription|Calculated Dose Reference Description|ST|1||
30080076|CalculatedDoseReferenceDoseValue|Calculated Dose Reference Dose Value|DS|1||
30080078|StartMeterset|Start Meterset|DS|1||
3008007A|EndMeterset|End Meterset|DS|1||
30080080|ReferencedMeasuredDoseReferenceSequence|Referenced Measured Dose Reference Sequence|SQ|1||
30080082|ReferencedMeasuredDoseReferenceNumber|Referenced Measured Dose Reference Number|IS|1||
30080090|ReferencedCalculatedDoseReferenceSequence|Referenced Calculated Dose Reference Sequence|SQ|1||
30080092|ReferencedCalculatedDoseReferenceNumber|Referenced Calculated Dose Reference Number|IS|1||
300800A0|BeamLimitingDeviceLeafPairsSequence|Beam Limiting Device Leaf Pairs Sequence|SQ|1||
300800A1|EnhancedRTBeamLimitingDeviceSequence|Enhanced RT Beam Limiting Device Sequence|SQ|1||
300800A2|EnhancedRTBeamLimitingOpeningSequence|Enhanced RT Beam Limiting Opening Sequence|SQ|1||
300800A3|EnhancedRTBeamLimitingDeviceDefinitionFlag|Enhanced RT Beam Limiting Device Definition Flag|CS|1||
300800A4|ParallelRTBeamDelimiterOpeningExtents|Parallel RT Beam Delimiter Opening Extents|FD|2-2n||
300800B0|RecordedWedgeSequence|Recorded Wedge Sequence|SQ|1||
300800C0|RecordedCompensatorSequence|Recorded Compensator Sequence|SQ|1||
300800D0|RecordedBlockSequence|Recorded Block Sequence|SQ|1||
300800D1|RecordedBlockSlabSequence|Recorded Block Slab Sequence|SQ|1||
300800E0|TreatmentSummaryMeasuredDoseReferenceSequence|Treatment Summary Measured Dose Reference Sequence|SQ|1||
300800F0|RecordedSnoutSequence|Recorded Snout Sequence|SQ|1||
300800F2|RecordedRangeShifterSequence|Recorded Range Shifter Sequence|SQ|1||
300800F4|RecordedLateralSpreadingDeviceSequence|Recorded Lateral Spreading Device Sequence|SQ|1||
300800F6|RecordedRangeModulatorSequence|Recorded Range Modulator Sequence|SQ|1||
30080100|RecordedSourceSequence|Recorded Source Sequence|SQ|1||
30080105|SourceSerialNumber|Source Serial Number|LO|1||
30080110|TreatmentSessionApplicationSetupSequence|Treatment Session Application Setup Sequence|SQ|1||
30080116|ApplicationSetupCheck|Application Setup Check|CS|1||
30080120|RecordedBrachyAccessoryDeviceSequence|Recorded Brachy Accessory Device Sequence|SQ|1||
30080122|ReferencedBrachyAccessoryDeviceNumber|Referenced Brachy Accessory Device Number|IS|1||
30080130|RecordedChannelSequence|Recorded Channel Sequence|SQ|1||
30080132|SpecifiedChannelTotalTime|Specified Channel Total Time|DS|1||
30080134|DeliveredChannelTotalTime|Delivered Channel Total Time|DS|1||
30080136|SpecifiedNumberOfPulses|Specified Number of Pulses|IS|1||
30080138|DeliveredNumberOfPulses|Delivered Number of Pulses|IS|1||
3008013A|SpecifiedPulseRepetitionInterval|Specified Pulse Repetition Interval|DS|1||
3008013C|DeliveredPulseRepetitionInterval|Delivered Pulse Repetition Interval|DS|1||
30080140|RecordedSourceApplicatorSequence|Recorded Source Applicator Sequence|SQ|1||
30080142|ReferencedSourceApplicatorNumber|Referenced Source Applicator Number|IS|1||
30080150|RecordedChannelShieldSequence|Recorded Channel Shield Sequence|SQ|1||
30080152|ReferencedChannelShieldNumber|Referenced Channel Shield Number|IS|1||
30080160|BrachyControlPointDeliveredSequence|Brachy Control Point Delivered Sequence|SQ|1||
30080162|SafePositionExitDate|Safe Position Exit Date|DA|1||
30080164|SafePositionExitTime|Safe Position Exit Time|TM|1||
30080166|SafePositionReturnDate|Safe Position Return Date|DA|1||
30080168|SafePositionReturnTime|Safe Position Return Time|TM|1||
30080171|PulseSpecificBrachyControlPointDeliveredSequence|Pulse Specific Brachy Control Point Delivered Sequence|SQ|1||
30080172|PulseNumber|Pulse Number|US|1||
30080173|BrachyPulseControlPointDeliveredSequence|Brachy Pulse Control Point Delivered Sequence|SQ|1||
30080200|CurrentTreatmentStatus|Current Treatment Status|CS|1||
30080202|TreatmentStatusComment|Treatment Status Comment|ST|1||
30080220|FractionGroupSummarySequence|Fraction Group Summary Sequence|SQ|1||
30080223|ReferencedFractionNumber|Referenced Fraction Number|IS|1||
30080224|FractionGroupType|Fraction Group Type|CS|1||
30080230|BeamStopperPosition|Beam Stopper Position|CS|1||
30080240|FractionStatusSummarySequence|Fraction Status Summary Sequence|SQ|1||
30080250|TreatmentDate|Treatment Date|DA|1||
30080251|TreatmentTime|Treatment Time|TM|1||
300A0002|RTPlanLabel|RT Plan Label|SH|1||
300A0003|RTPlanName|RT Plan Name|LO|1||
300A0004|RTPlanDescription|RT Plan Description|ST|1||
300A0006|RTPlanDate|RT Plan Date|DA|1||
300A0007|RTPlanTime|RT Plan Time|TM|1||
300A0009|TreatmentProtocols|Treatment Protocols|LO|1-n||
300A000A|PlanIntent|Plan Intent|CS|1||
300A000B|TreatmentSites|Treatment Sites|LO|1-n|R|
300A000C|RTPlanGeometry|RT Plan Geometry|CS|1||
300A000E|PrescriptionDescription|Prescription Description|ST|1||
300A0010|DoseReferenceSequence|Dose Reference Sequence|SQ|1||
300A0012|DoseReferenceNumber|Dose Reference Number|IS|1||
300A0013|DoseReferenceUID|Dose Reference UID|UI|1||
300A0014|DoseReferenceStructureType|Dose Reference Structure Type|CS|1||
300A0015|NominalBeamEnergyUnit|Nominal Beam Energy Unit|CS|1||
300A0016|DoseReferenceDescription|Dose Reference Description|LO|1||
300A0018|DoseReferencePointCoordinates|Dose Reference Point Coordinates|DS|3||
300A001A|NominalPriorDose|Nominal Prior Dose|DS|1||
300A0020|DoseReferenceType|Dose Reference Type|CS|1||
300A0021|ConstraintWeight|Constraint Weight|DS|1||
300A0022|DeliveryWarningDose|Delivery Warning Dose|DS|1||
300A0023|DeliveryMaximumDose|Delivery Maximum Dose|DS|1||
300A0025|TargetMinimumDose|Target Minimum Dose|DS|1||
300A0026|TargetPrescriptionDose|Target Prescription Dose|DS|1||
300A0027|TargetMaximumDose|Target Maximum Dose|DS|1||
300A0028|TargetUnderdoseVolumeFraction|Target Underdose Volume Fraction|DS|1||
300A002A|OrganAtRiskFullVolumeDose|Organ at Risk Full-volume Dose|DS|1||
300A002B|OrganAtRiskLimitDose|Organ at Risk Limit Dose|DS|1||
300A002C|OrganAtRiskMaximumDose|Organ at Risk Maximum Dose|DS|1||
300A002D|OrganAtRiskOverdoseVolumeFraction|Organ at Risk Overdose Volume Fraction|DS|1||
300A0040|ToleranceTableSequence|Tolerance Table Sequence|SQ|1||
300A0042|ToleranceTableNumber|Tolerance Table Number|IS|1||
300A0043|ToleranceTableLabel|Tolerance Table Label|SH|1||
300A0044|GantryAngleTolerance|Gantry Angle Tolerance|DS|1||
300A0046|BeamLimitingDeviceAngleTolerance|Beam Limiting Device Angle Tolerance|DS|1||
300A0048|BeamLimitingDeviceToleranceSequence|Beam Limiting Device Tolerance Sequence|SQ|1||
300A004A|BeamLimitingDevicePositionTolerance|Beam Limiting Device Position Tolerance|DS|1||
300A004B|SnoutPositionTolerance|Snout Position Tolerance|FL|1||
300A004C|PatientSupportAngleTolerance|Patient Support Angle Tolerance|DS|1||
300A004E|TableTopEccentricAngleTolerance|Table Top Eccentric Angle Tolerance|DS|1||
300A004F|TableTopPitchAngleTolerance|Table Top Pitch Angle Tolerance|FL|1||
300A0050|TableTopRollAngleTolerance|Table Top Roll Angle Tolerance|FL|1||
300A0051|TableTopVerticalPositionTolerance|Table Top Vertical Position Tolerance|DS|1||
300A0052|TableTopLongitudinalPositionTolerance|Table Top Longitudinal Position Tolerance|DS|1||
300A0053|TableTopLateralPositionTolerance|Table Top Lateral Position Tolerance|DS|1||
300A0054|TableTopPositionAlignmentUID|Table Top Position Alignment UID|UI|1||
300A0055|RTPlanRelationship|RT Plan Relationship|CS|1||
300A0070|FractionGroupSequence|Fraction Group Sequence|SQ|1||
300A0071|FractionGroupNumber|Fraction Group Number|IS|1||
300A0072|FractionGroupDescription|Fraction Group Description|LO|1||
300A0078|NumberOfFractionsPlanned|Number of Fractions Planned|IS|1||
300A0079|NumberOfFractionPatternDigitsPerDay|Number of Fraction Pattern Digits Per Day|IS|1||
300A007A|RepeatFractionCycleLength|Repeat Fraction Cycle Length|IS|1||
300A007B|FractionPattern|Fraction Pattern|LT|1||
300A0080|NumberOfBeams|Number of Beams|IS|1||
300A0082|BeamDoseSpecificationPoint|Beam Dose Specification Point|DS|3|R|
300A0083|ReferencedDoseReferenceUID|Referenced Dose Reference UID|UI|1||
300A0084|BeamDose|Beam Dose|DS|1||
300A0086|BeamMeterset|Beam Meterset|DS|1||
300A0088|BeamDosePointDepth|Beam Dose Point Depth|FL|1||
300A0089|BeamDosePointEquivalentDepth|Beam Dose Point Equivalent Depth|FL|1||
300A008A|BeamDosePointSSD|Beam Dose Point SSD|FL|1||
300A008B|BeamDoseMeaning|Beam Dose Meaning|CS|1||
300A008C|BeamDoseVerificationControlPointSequence|Beam Dose Verification Control Point Sequence|SQ|1||
300A008D|AverageBeamDosePointDepth|Average Beam Dose Point Depth|FL|1|R|
300A008E|AverageBeamDosePointEquivalentDepth|Average Beam Dose Point Equivalent Depth|FL|1|R|
300A008F|AverageBeamDosePointSSD|Average Beam Dose Point SSD|FL|1|R|
300A0090|BeamDoseType|Beam Dose Type|CS|1||
300A0091|AlternateBeamDose|Alternate Beam Dose|DS|1||
300A0092|AlternateBeamDoseType|Alternate Beam Dose Type|CS|1||
300A0093|DepthValueAveragingFlag|Depth Value Averaging Flag|CS|1||
300A0094|BeamDosePointSourceToExternalContourDistance|Beam Dose Point Source to External Contour Distance|DS|1||
300A00A0|NumberOfBrachyApplicationSetups|Number of Brachy Application Setups|IS|1||
300A00A2|BrachyApplicationSetupDoseSpecificationPoint|Brachy Application Setup Dose Specification Point|DS|3||
300A00A4|BrachyApplicationSetupDose|Brachy Application Setup Dose|DS|1||
300A00B0|BeamSequence|Beam Sequence|SQ|1||
300A00B2|TreatmentMachineName|Treatment Machine Name|SH|1||
300A00B3|PrimaryDosimeterUnit|Primary Dosimeter Unit|CS|1||
300A00B4|SourceAxisDistance|Source-Axis Distance|DS|1||
300A00B6|BeamLimitingDeviceSequence|Beam Limiting Device Sequence|SQ|1||
300A00B8|RTBeamLimitingDeviceType|RT Beam Limiting Device Type|CS|1||
300A00BA|SourceToBeamLimitingDeviceDistance|Source to Beam Limiting Device Distance|DS|1||
300A00BB|IsocenterToBeamLimitingDeviceDistance|Isocenter to Beam Limiting Device Distance|FL|1||
300A00BC|NumberOfLeafJawPairs|Number of Leaf/Jaw Pairs|IS|1||
300A00BE|LeafPositionBoundaries|Leaf Position Boundaries|DS|3-n||
300A00C0|BeamNumber|Beam Number|IS|1||
300A00C2|BeamName|Beam Name|LO|1||
300A00C3|BeamDescription|Beam Description|ST|1||
300A00C4|BeamType|Beam Type|CS|1||
300A00C5|BeamDeliveryDurationLimit|Beam Delivery Duration Limit|FD|1||
300A00C6|RadiationType|Radiation Type|CS|1||
300A00C7|HighDoseTechniqueType|High-Dose Technique Type|CS|1||
300A00C8|ReferenceImageNumber|Reference Image Number|IS|1||
300A00CA|PlannedVerificationImageSequence|Planned Verification Image Sequence|SQ|1||
300A00CC|ImagingDeviceSpecificAcquisitionParameters|Imaging Device-Specific Acquisition Parameters|LO|1-n||
300A00CE|TreatmentDeliveryType|Treatment Delivery Type|CS|1||
300A00D0|NumberOfWedges|Number of Wedges|IS|1||
300A00D1|WedgeSequence|Wedge Sequence|SQ|1||
300A00D2|WedgeNumber|Wedge Number|IS|1||
300A00D3|WedgeType|Wedge Type|CS|1||
300A00D4|WedgeID|Wedge ID|SH|1||
300A00D5|WedgeAngle|Wedge Angle|IS|1||
300A00D6|WedgeFactor|Wedge Factor|DS|1||
300A00D7|TotalWedgeTrayWaterEquivalentThickness|Total Wedge Tray Water-Equivalent Thickness|FL|1||
300A00D8|WedgeOrientation|Wedge Orientation|DS|1||
300A00D9|IsocenterToWedgeTrayDistance|Isocenter to Wedge Tray Distance|FL|1||
300A00DA|SourceToWedgeTrayDistance|Source to Wedge Tray Distance|DS|1||
300A00DB|WedgeThinEdgePosition|Wedge Thin Edge Position|FL|1||
300A00DC|BolusID|Bolus ID|SH|1||
300A00DD|BolusDescription|Bolus Description|ST|1||
300A00DE|EffectiveWedgeAngle|Effective Wedge Angle|DS|1||
300A00E0|NumberOfCompensators|Number of Compensators|IS|1||
300A00E1|MaterialID|Material ID|SH|1||
300A00E2|TotalCompensatorTrayFactor|Total Compensator Tray Factor|DS|1||
300A00E3|CompensatorSequence|Compensator Sequence|SQ|1||
300A00E4|CompensatorNumber|Compensator Number|IS|1||
300A00E5|CompensatorID|Compensator ID|SH|1||
300A00E6|SourceToCompensatorTrayDistance|Source to Compensator Tray Distance|DS|1||
300A00E7|CompensatorRows|Compensator Rows|IS|1||
300A00E8|CompensatorColumns|Compensator Columns|IS|1||
300A00E9|CompensatorPixelSpacing|Compensator Pixel Spacing|DS|2||
300A00EA|CompensatorPosition|Compensator Position|DS|2||
300A00EB|CompensatorTransmissionData|Compensator Transmission Data|DS|1-n||
300A00EC|CompensatorThicknessData|Compensator Thickness Data|DS|1-n||
300A00ED|NumberOfBoli|Number of Boli|IS|1||
300A00EE|CompensatorType|Compensator Type|CS|1||
300A00EF|CompensatorTrayID|Compensator Tray ID|SH|1||
300A00F0|NumberOfBlocks|Number of Blocks|IS|1||
300A00F2|TotalBlockTrayFactor|Total Block Tray Factor|DS|1||
300A00F3|TotalBlockTrayWaterEquivalentThickness|Total Block Tray Water-Equivalent Thickness|FL|1||
300A00F4|BlockSequence|Block Sequence|SQ|1||
300A00F5|BlockTrayID|Block Tray ID|SH|1||
300A00F6|SourceToBlockTrayDistance|Source to Block Tray Distance|DS|1||
300A00F7|IsocenterToBlockTrayDistance|Isocenter to Block Tray Distance|FL|1||
300A00F8|BlockType|Block Type|CS|1||
300A00F9|AccessoryCode|Accessory Code|LO|1||
300A00FA|BlockDivergence|Block Divergence|CS|1||
300A00FB|BlockMountingPosition|Block Mounting Position|CS|1||
300A00FC|BlockNumber|Block Number|IS|1||
300A00FE|BlockName|Block Name|LO|1||
300A0100|BlockThickness|Block Thickness|DS|1||
300A0102|BlockTransmission|Block Transmission|DS|1||
300A0104|BlockNumberOfPoints|Block Number of Points|IS|1||
300A0106|BlockData|Block Data|DS|2-2n||
300A0107|ApplicatorSequence|Applicator Sequence|SQ|1||
300A0108|ApplicatorID|Applicator ID|SH|1||
300A0109|ApplicatorType|Applicator Type|CS|1||
300A010A|ApplicatorDescription|Applicator Description|LO|1||
300A010C|CumulativeDoseReferenceCoefficient|Cumulative Dose Reference Coefficient|DS|1||
300A010E|FinalCumulativeMetersetWeight|Final Cumulative Meterset Weight|DS|1||
300A0110|NumberOfControlPoints|Number of Control Points|IS|1||
300A0111|ControlPointSequence|Control Point Sequence|SQ|1||
300A0112|ControlPointIndex|Control Point Index|IS|1||
300A0114|NominalBeamEnergy|Nominal Beam Energy|DS|1||
300A0115|DoseRateSet|Dose Rate Set|DS|1||
300A0116|WedgePositionSequence|Wedge Position Sequence|SQ|1||
300A0118|WedgePosition|Wedge Position|CS|1||
300A011A|BeamLimitingDevicePositionSequence|Beam Limiting Device Position Sequence|SQ|1||
300A011C|LeafJawPositions|Leaf/Jaw Positions|DS|2-2n||
300A011E|GantryAngle|Gantry Angle|DS|1||
300A011F|GantryRotationDirection|Gantry Rotation Direction|CS|1||
300A0120|BeamLimitingDeviceAngle|Beam Limiting Device Angle|DS|1||
300A0121|BeamLimitingDeviceRotationDirection|Beam Limiting Device Rotation Direction|CS|1||
300A0122|PatientSupportAngle|Patient Support Angle|DS|1||
300A0123|PatientSupportRotationDirection|Patient Support Rotation Direction|CS|1||
300A0124|TableTopEccentricAxisDistance|Table Top Eccentric Axis Distance|DS|1||
300A0125|TableTopEccentricAngle|Table Top Eccentric Angle|DS|1||
300A0126|TableTopEccentricRotationDirection|Table Top Eccentric Rotation Direction|CS|1||
300A0128|TableTopVerticalPosition|Table Top Vertical Position|DS|1||
300A0129|TableTopLongitudinalPosition|Table Top Longitudinal Position|DS|1||
300A012A|TableTopLateralPosition|Table Top Lateral Position|DS|1||
300A012C|IsocenterPosition|Isocenter Position|DS|3||
300A012E|SurfaceEntryPoint|Surface Entry Point|DS|3||
300A0130|SourceToSurfaceDistance|Source to Surface Distance|DS|1||
300A0131|AverageBeamDosePointSourceToExternalContourDistance|Average Beam Dose Point Source to External Contour Distance|FL|1||
300A0132|SourceToExternalContourDistance|Source to External Contour Distance|FL|1||
300A0133|ExternalContourEntryPoint|External Contour Entry Point|FL|3||
300A0134|CumulativeMetersetWeight|Cumulative Meterset Weight|DS|1||
300A0135|||||R|
300A0140|TableTopPitchAngle|Table Top Pitch Angle|FL|1||
300A0142|TableTopPitchRotationDirection|Table Top Pitch Rotation Direction|CS|1||
300A0144|TableTopRollAngle|Table Top Roll Angle|FL|1||
300A0146|TableTopRollRotationDirection|Table Top Roll Rotation Direction|CS|1||
300A0148|HeadFixationAngle|Head Fixation Angle|FL|1||
300A014A|GantryPitchAngle|Gantry Pitch Angle|FL|1||
300A014C|GantryPitchRotationDirection|Gantry Pitch Rotation Direction|CS|1||
300A014E|GantryPitchAngleTolerance|Gantry Pitch Angle Tolerance|FL|1||
300A0150|FixationEye|Fixation Eye|CS|1||
300A0151|ChairHeadFramePosition|Chair Head Frame Position|DS|1||
300A0152|HeadFixationAngleTolerance|Head Fixation Angle Tolerance|DS|1||
300A0153|ChairHeadFramePositionTolerance|Chair Head Frame Position Tolerance|DS|1||
300A0154|FixationLightAzimuthalAngleTolerance|Fixation Light Azimuthal Angle Tolerance|DS|1||
300A0155|FixationLightPolarAngleTolerance|Fixation Light Polar Angle Tolerance|DS|1||
300A0180|PatientSetupSequence|Patient Setup Sequence|SQ|1||
300A0182|PatientSetupNumber|Patient Setup Number|IS|1||
300A0183|PatientSetupLabel|Patient Setup Label|LO|1||
300A0184|PatientAdditionalPosition|Patient Additional Position|LO|1||
300A0190|FixationDeviceSequence|Fixation Device Sequence|SQ|1||
300A0192|FixationDeviceType|Fixation Device Type|CS|1||
300A0194|FixationDeviceLabel|Fixation Device Label|SH|1||
300A0196|FixationDeviceDescription|Fixation Device Description|ST|1||
300A0198|FixationDevicePosition|Fixation Device Position|SH|1||
300A0199|FixationDevicePitchAngle|Fixation Device Pitch Angle|FL|1||
300A019A|FixationDeviceRollAngle|Fixation Device Roll Angle|FL|1||
300A01A0|ShieldingDeviceSequence|Shielding Device Sequence|SQ|1||
300A01A2|ShieldingDeviceType|Shielding Device Type|CS|1||
300A01A4|ShieldingDeviceLabel|Shielding Device Label|SH|1||
300A01A6|ShieldingDeviceDescription|Shielding Device Description|ST|1||
300A01A8|ShieldingDevicePosition|Shielding Device Position|SH|1||
300A01B0|SetupTechnique|Setup Technique|CS|1||
300A01B2|SetupTechniqueDescription|Setup Technique Description|ST|1||
300A01B4|SetupDeviceSequence|Setup Device Sequence|SQ|1||
300A01B6|SetupDeviceType|Setup Device Type|CS|1||
300A01B8|SetupDeviceLabel|Setup Device Label|SH|1||
300A01BA|SetupDeviceDescription|Setup Device Description|ST|1||
300A01BC|SetupDeviceParameter|Setup Device Parameter|DS|1||
300A01D0|SetupReferenceDescription|Setup Reference Description|ST|1||
300A01D2|TableTopVerticalSetupDisplacement|Table Top Vertical Setup Displacement|DS|1||
300A01D4|TableTopLongitudinalSetupDisplacement|Table Top Longitudinal Setup Displacement|DS|1||
300A01D6|TableTopLateralSetupDisplacement|Table Top Lateral Setup Displacement|DS|1||
300A0200|BrachyTreatmentTechnique|Brachy Treatment Technique|CS|1||
300A0202|BrachyTreatmentType|Brachy Treatment Type|CS|1||
300A0206|TreatmentMachineSequence|Treatment Machine Sequence|SQ|1||
300A0210|SourceSequence|Source Sequence|SQ|1||
300A0212|SourceNumber|Source Number|IS|1||
300A0214|SourceType|Source Type|CS|1||
300A0216|SourceManufacturer|Source Manufacturer|LO|1||
300A0218|ActiveSourceDiameter|Active Source Diameter|DS|1||
300A021A|ActiveSourceLength|Active Source Length|DS|1||
300A021B|SourceModelID|Source Model ID|SH|1||
300A021C|SourceDescription|Source Description|LO|1||
300A0222|SourceEncapsulationNominalThickness|Source Encapsulation Nominal Thickness|DS|1||
300A0224|SourceEncapsulationNominalTransmission|Source Encapsulation Nominal Transmission|DS|1||
300A0226|SourceIsotopeName|Source Isotope Name|LO|1||
300A0228|SourceIsotopeHalfLife|Source Isotope Half Life|DS|1||
300A0229|SourceStrengthUnits|Source Strength Units|CS|1||
300A022A|ReferenceAirKermaRate|Reference Air Kerma Rate|DS|1||
300A022B|SourceStrength|Source Strength|DS|1||
300A022C|SourceStrengthReferenceDate|Source Strength Reference Date|DA|1||
300A022E|SourceStrengthReferenceTime|Source Strength Reference Time|TM|1||
300A0230|ApplicationSetupSequence|Application Setup Sequence|SQ|1||
300A0232|ApplicationSetupType|Application Setup Type|CS|1||
300A0234|ApplicationSetupNumber|Application Setup Number|IS|1||
300A0236|ApplicationSetupName|Application Setup Name|LO|1||
300A0238|ApplicationSetupManufacturer|Application Setup Manufacturer|LO|1||
300A0240|TemplateNumber|Template Number|IS|1||
300A0242|TemplateType|Template Type|SH|1||
300A0244|TemplateName|Template Name|LO|1||
300A0250|TotalReferenceAirKerma|Total Reference Air Kerma|DS|1||
300A0260|BrachyAccessoryDeviceSequence|Brachy Accessory Device Sequence|SQ|1||
300A0262|BrachyAccessoryDeviceNumber|Brachy Accessory Device Number|IS|1||
300A0263|BrachyAccessoryDeviceID|Brachy Accessory Device ID|SH|1||
300A0264|BrachyAccessoryDeviceType|Brachy Accessory Device Type|CS|1||
300A0266|BrachyAccessoryDeviceName|Brachy Accessory Device Name|LO|1||
300A026A|BrachyAccessoryDeviceNominalThickness|Brachy Accessory Device Nominal Thickness|DS|1||
300A026C|BrachyAccessoryDeviceNominalTransmission|Brachy Accessory Device Nominal Transmission|DS|1||
300A0271|ChannelEffectiveLength|Channel Effective Length|DS|1||
300A0272|ChannelInnerLength|Channel Inner Length|DS|1||
300A0273|AfterloaderChannelID|Afterloader Channel ID|SH|1||
300A0274|SourceApplicatorTipLength|Source Applicator Tip Length|DS|1||
300A0280|ChannelSequence|Channel Sequence|SQ|1||
300A0282|ChannelNumber|Channel Number|IS|1||
300A0284|ChannelLength|Channel Length|DS|1||
300A0286|ChannelTotalTime|Channel Total Time|DS|1||
300A0288|SourceMovementType|Source Movement Type|CS|1||
300A028A|NumberOfPulses|Number of Pulses|IS|1||
300A028C|PulseRepetitionInterval|Pulse Repetition Interval|DS|1||
300A0290|SourceApplicatorNumber|Source Applicator Number|IS|1||
300A0291|SourceApplicatorID|Source Applicator ID|SH|1||
300A0292|SourceApplicatorType|Source Applicator Type|CS|1||
300A0294|SourceApplicatorName|Source Applicator Name|LO|1||
300A0296|SourceApplicatorLength|Source Applicator Length|DS|1||
300A0298|SourceApplicatorManufacturer|Source Applicator Manufacturer|LO|1||
300A029C|SourceApplicatorWallNominalThickness|Source Applicator Wall Nominal Thickness|DS|1||
300A029E|SourceApplicatorWallNominalTransmission|Source Applicator Wall Nominal Transmission|DS|1||
300A02A0|SourceApplicatorStepSize|Source Applicator Step Size|DS|1||
300A02A1|ApplicatorShapeReferencedROINumber|Applicator Shape Referenced ROI Number|IS|1||
300A02A2|TransferTubeNumber|Transfer Tube Number|IS|1||
300A02A4|TransferTubeLength|Transfer Tube Length|DS|1||
300A02B0|ChannelShieldSequence|Channel Shield Sequence|SQ|1||
300A02B2|ChannelShieldNumber|Channel Shield Number|IS|1||
300A02B3|ChannelShieldID|Channel Shield ID|SH|1||
300A02B4|ChannelShieldName|Channel Shield Name|LO|1||
300A02B8|ChannelShieldNominalThickness|Channel Shield Nominal Thickness|DS|1||
300A02BA|ChannelShieldNominalTransmission|Channel Shield Nominal Transmission|DS|1||
300A02C8|FinalCumulativeTimeWeight|Final Cumulative Time Weight|DS|1||
300A02D0|BrachyControlPointSequence|Brachy Control Point Sequence|SQ|1||
300A02D2|ControlPointRelativePosition|Control Point Relative Position|DS|1||
300A02D4|ControlPoint3DPosition|Control Point 3D Position|DS|3||
300A02D6|CumulativeTimeWeight|Cumulative Time Weight|DS|1||
300A02E0|CompensatorDivergence|Compensator Divergence|CS|1||
300A02E1|CompensatorMountingPosition|Compensator Mounting Position|CS|1||
300A02E2|SourceToCompensatorDistance|Source to Compensator Distance|DS|1-n||
300A02E3|TotalCompensatorTrayWaterEquivalentThickness|Total Compensator Tray Water-Equivalent Thickness|FL|1||
300A02E4|IsocenterToCompensatorTrayDistance|Isocenter to Compensator Tray Distance|FL|1||
300A02E5|CompensatorColumnOffset|Compensator Column Offset|FL|1||
300A02E6|IsocenterToCompensatorDistances|Isocenter to Compensator Distances|FL|1-n||
300A02E7|CompensatorRelativeStoppingPowerRatio|Compensator Relative Stopping Power Ratio|FL|1||
300A02E8|CompensatorMillingToolDiameter|Compensator Milling Tool Diameter|FL|1||
300A02EA|IonRangeCompensatorSequence|Ion Range Compensator Sequence|SQ|1||
300A02EB|CompensatorDescription|Compensator Description|LT|1||
300A02EC|CompensatorSurfaceRepresentationFlag|Compensator Surface Representation Flag|CS|1||
300A0302|RadiationMassNumber|Radiation Mass Number|IS|1||
300A0304|RadiationAtomicNumber|Radiation Atomic Number|IS|1||
300A0306|RadiationChargeState|Radiation Charge State|SS|1||
300A0308|ScanMode|Scan Mode|CS|1||
300A0309|ModulatedScanModeType|Modulated Scan Mode Type|CS|1||
300A030A|VirtualSourceAxisDistances|Virtual Source-Axis Distances|FL|2||
300A030C|SnoutSequence|Snout Sequence|SQ|1||
300A030D|SnoutPosition|Snout Position|FL|1||
300A030F|SnoutID|Snout ID|SH|1||
300A0312|NumberOfRangeShifters|Number of Range Shifters|IS|1||
300A0314|RangeShifterSequence|Range Shifter Sequence|SQ|1||
300A0316|RangeShifterNumber|Range Shifter Number|IS|1||
300A0318|RangeShifterID|Range Shifter ID|SH|1||
300A0320|RangeShifterType|Range Shifter Type|CS|1||
300A0322|RangeShifterDescription|Range Shifter Description|LO|1||
300A0330|NumberOfLateralSpreadingDevices|Number of Lateral Spreading Devices|IS|1||
300A0332|LateralSpreadingDeviceSequence|Lateral Spreading Device Sequence|SQ|1||
300A0334|LateralSpreadingDeviceNumber|Lateral Spreading Device Number|IS|1||
300A0336|LateralSpreadingDeviceID|Lateral Spreading Device ID|SH|1||
300A0338|LateralSpreadingDeviceType|Lateral Spreading Device Type|CS|1||
300A033A|LateralSpreadingDeviceDescription|Lateral Spreading Device Description|LO|1||
300A033C|LateralSpreadingDeviceWaterEquivalentThickness|Lateral Spreading Device Water Equivalent Thickness|FL|1||
300A0340|NumberOfRangeModulators|Number of Range Modulators|IS|1||
300A0342|RangeModulatorSequence|Range Modulator Sequence|SQ|1||
300A0344|RangeModulatorNumber|Range Modulator Number|IS|1||
300A0346|RangeModulatorID|Range Modulator ID|SH|1||
300A0348|RangeModulatorType|Range Modulator Type|CS|1||
300A034A|RangeModulatorDescription|Range Modulator Description|LO|1||
300A034C|BeamCurrentModulationID|Beam Current Modulation ID|SH|1||
300A0350|PatientSupportType|Patient Support Type|CS|1||
300A0352|PatientSupportID|Patient Support ID|SH|1||
300A0354|PatientSupportAccessoryCode|Patient Support Accessory Code|LO|1||
300A0355|TrayAccessoryCode|Tray Accessory Code|LO|1||
300A0356|FixationLightAzimuthalAngle|Fixation Light Azimuthal Angle|FL|1||
300A0358|FixationLightPolarAngle|Fixation Light Polar Angle|FL|1||
300A035A|MetersetRate|Meterset Rate|FL|1||
300A0360|RangeShifterSettingsSequence|Range Shifter Settings Sequence|SQ|1||
300A0362|RangeShifterSetting|Range Shifter Setting|LO|1||
300A0364|IsocenterToRangeShifterDistance|Isocenter to Range Shifter Distance|FL|1||
300A0366|RangeShifterWaterEquivalentThickness|Range Shifter Water Equivalent Thickness|FL|1||
300A0370|LateralSpreadingDeviceSettingsSequence|Lateral Spreading Device Settings Sequence|SQ|1||
300A0372|LateralSpreadingDeviceSetting|Lateral Spreading Device Setting|LO|1||
300A0374|IsocenterToLateralSpreadingDeviceDistance|Isocenter to Lateral Spreading Device Distance|FL|1||
300A0380|RangeModulatorSettingsSequence|Range Modulator Settings Sequence|SQ|1||
300A0382|RangeModulatorGatingStartValue|Range Modulator Gating Start Value|FL|1||
300A0384|RangeModulatorGatingStopValue|Range Modulator Gating Stop Value|FL|1||
300A0386|RangeModulatorGatingStartWaterEquivalentThickness|Range Modulator Gating Start Water Equivalent Thickness|FL|1||
300A0388|RangeModulatorGatingStopWaterEquivalentThickness|Range Modulator Gating Stop Water Equivalent Thickness|FL|1||
300A038A|IsocenterToRangeModulatorDistance|Isocenter to Range Modulator Distance|FL|1||
300A038F|ScanSpotTimeOffset|Scan Spot Time Offset|FL|1-n||
300A0390|ScanSpotTuneID|Scan Spot Tune ID|SH|1||
300A0391|ScanSpotPrescribedIndices|Scan Spot Prescribed Indices|IS|1-n||
300A0392|NumberOfScanSpotPositions|Number of Scan Spot Positions|IS|1||
300A0393|ScanSpotReordered|Scan Spot Reordered|CS|1||
300A0394|ScanSpotPositionMap|Scan Spot Position Map|FL|1-n||
300A0395|ScanSpotReorderingAllowed|Scan Spot Reordering Allowed|CS|1||
300A0396|ScanSpotMetersetWeights|Scan Spot Meterset Weights|FL|1-n||
300A0398|ScanningSpotSize|Scanning Spot Size|FL|2||
300A0399|ScanSpotSizesDelivered|Scan Spot Sizes Delivered|FL|2-2n||
300A039A|NumberOfPaintings|Number of Paintings|IS|1||
300A039B|ScanSpotGantryAngles|Scan Spot Gantry Angles|FL|1-n||
300A039C|ScanSpotPatientSupportAngles|Scan Spot Patient Support Angles|FL|1-n||
300A03A0|IonToleranceTableSequence|Ion Tolerance Table Sequence|SQ|1||
300A03A2|IonBeamSequence|Ion Beam Sequence|SQ|1||
300A03A4|IonBeamLimitingDeviceSequence|Ion Beam Limiting Device Sequence|SQ|1||
300A03A6|IonBlockSequence|Ion Block Sequence|SQ|1||
300A03A8|IonControlPointSequence|Ion Control Point Sequence|SQ|1||
300A03AA|IonWedgeSequence|Ion Wedge Sequence|SQ|1||
300A03AC|IonWedgePositionSequence|Ion Wedge Position Sequence|SQ|1||
300A0401|ReferencedSetupImageSequence|Referenced Setup Image Sequence|SQ|1||
300A0402|SetupImageComment|Setup Image Comment|ST|1||
300A0410|MotionSynchronizationSequence|Motion Synchronization Sequence|SQ|1||
300A0412|ControlPointOrientation|Control Point Orientation|FL|3||
300A0420|GeneralAccessorySequence|General Accessory Sequence|SQ|1||
300A0421|GeneralAccessoryID|General Accessory ID|SH|1||
300A0422|GeneralAccessoryDescription|General Accessory Description|ST|1||
300A0423|GeneralAccessoryType|General Accessory Type|CS|1||
300A0424|GeneralAccessoryNumber|General Accessory Number|IS|1||
300A0425|SourceToGeneralAccessoryDistance|Source to General Accessory Distance|FL|1||
300A0426|IsocenterToGeneralAccessoryDistance|Isocenter to General Accessory Distance|DS|1||
300A0431|ApplicatorGeometrySequence|Applicator Geometry Sequence|SQ|1||
300A0432|ApplicatorApertureShape|Applicator Aperture Shape|CS|1||
300A0433|ApplicatorOpening|Applicator Opening|FL|1||
300A0434|ApplicatorOpeningX|Applicator Opening X|FL|1||
300A0435|ApplicatorOpeningY|Applicator Opening Y|FL|1||
300A0436|SourceToApplicatorMountingPositionDistance|Source to Applicator Mounting Position Distance|FL|1||
300A0440|NumberOfBlockSlabItems|Number of Block Slab Items|IS|1||
300A0441|BlockSlabSequence|Block Slab Sequence|SQ|1||
300A0442|BlockSlabThickness|Block Slab Thickness|DS|1||
300A0443|BlockSlabNumber|Block Slab Number|US|1||
300A0450|DeviceMotionControlSequence|Device Motion Control Sequence|SQ|1||
300A0451|DeviceMotionExecutionMode|Device Motion Execution Mode|CS|1||
300A0452|DeviceMotionObservationMode|Device Motion Observation Mode|CS|1||
300A0453|DeviceMotionParameterCodeSequence|Device Motion Parameter Code Sequence|SQ|1||
300A0501|DistalDepthFraction|Distal Depth Fraction|FL|1||
300A0502|DistalDepth|Distal Depth|FL|1||
300A0503|NominalRangeModulationFractions|Nominal Range Modulation Fractions|FL|2||
300A0504|NominalRangeModulatedRegionDepths|Nominal Range Modulated Region Depths|FL|2||
300A0505|DepthDoseParametersSequence|Depth Dose Parameters Sequence|SQ|1||
300A0506|DeliveredDepthDoseParametersSequence|Delivered Depth Dose Parameters Sequence|SQ|1||
300A0507|DeliveredDistalDepthFraction|Delivered Distal Depth Fraction|FL|1||
300A0508|DeliveredDistalDepth|Delivered Distal Depth|FL|1||
300A0509|DeliveredNominalRangeModulationFractions|Delivered Nominal Range Modulation Fractions|FL|2||
300A0510|DeliveredNominalRangeModulatedRegionDepths|Delivered Nominal Range Modulated Region Depths|FL|2||
300A0511|DeliveredReferenceDoseDefinition|Delivered Reference Dose Definition|CS|1||
300A0512|ReferenceDoseDefinition|Reference Dose Definition|CS|1||
300A0600|RTControlPointIndex|RT Control Point Index|US|1||
300A0601|RadiationGenerationModeIndex|Radiation Generation Mode Index|US|1||
300A0602|ReferencedDefinedDeviceIndex|Referenced Defined Device Index|US|1||
300A0603|RadiationDoseIdentificationIndex|Radiation Dose Identification Index|US|1||
300A0604|NumberOfRTControlPoints|Number of RT Control Points|US|1||
300A0605|ReferencedRadiationGenerationModeIndex|Referenced Radiation Generation Mode Index|US|1||
300A0606|TreatmentPositionIndex|Treatment Position Index|US|1||
300A0607|ReferencedDeviceIndex|Referenced Device Index|US|1||
300A0608|TreatmentPositionGroupLabel|Treatment Position Group Label|LO|1||
300A0609|TreatmentPositionGroupUID|Treatment Position Group UID|UI|1||
300A060A|TreatmentPositionGroupSequence|Treatment Position Group Sequence|SQ|1||
300A060B|ReferencedTreatmentPositionIndex|Referenced Treatment Position Index|US|1||
300A060C|ReferencedRadiationDoseIdentificationIndex|Referenced Radiation Dose Identification Index|US|1||
300A060D|RTAccessoryHolderWaterEquivalentThickness|RT Accessory Holder Water-Equivalent Thickness|FD|1||
300A060E|ReferencedRTAccessoryHolderDeviceIndex|Referenced RT Accessory Holder Device Index|US|1||
300A060F|RTAccessoryHolderSlotExistenceFlag|RT Accessory Holder Slot Existence Flag|CS|1||
300A0610|RTAccessoryHolderSlotSequence|RT Accessory Holder Slot Sequence|SQ|1||
300A0611|RTAccessoryHolderSlotID|RT Accessory Holder Slot ID|LO|1||
300A0612|RTAccessoryHolderSlotDistance|RT Accessory Holder Slot Distance|FD|1||
300A0613|RTAccessorySlotDistance|RT Accessory Slot Distance|FD|1||
300A0614|RTAccessoryHolderDefinitionSequence|RT Accessory Holder Definition Sequence|SQ|1||
300A0615|RTAccessoryDeviceSlotID|RT Accessory Device Slot ID|LO|1||
300A0616|RTRadiationSequence|RT Radiation Sequence|SQ|1||
300A0617|RadiationDoseSequence|Radiation Dose Sequence|SQ|1||
300A0618|RadiationDoseIdentificationSequence|Radiation Dose Identification Sequence|SQ|1||
300A0619|RadiationDoseIdentificationLabel|Radiation Dose Identification Label|LO|1||
300A061A|ReferenceDoseType|Reference Dose Type|CS|1||
300A061B|PrimaryDoseValueIndicator|Primary Dose Value Indicator|CS|1||
300A061C|DoseValuesSequence|Dose Values Sequence|SQ|1||
300A061D|DoseValuePurpose|Dose Value Purpose|CS|1-n||
300A061E|ReferenceDosePointCoordinates|Reference Dose Point Coordinates|FD|3||
300A061F|RadiationDoseValuesParametersSequence|Radiation Dose Values Parameters Sequence|SQ|1||
300A0620|MetersetToDoseMappingSequence|Meterset to Dose Mapping Sequence|SQ|1||
300A0621|ExpectedInVivoMeasurementValuesSequence|Expected In-Vivo Measurement Values Sequence|SQ|1||
300A0622|ExpectedInVivoMeasurementValueIndex|Expected In-Vivo Measurement Value Index|US|1||
300A0623|RadiationDoseInVivoMeasurementLabel|Radiation Dose In-Vivo Measurement Label|LO|1||
300A0624|RadiationDoseCentralAxisDisplacement|Radiation Dose Central Axis Displacement|FD|2||
300A0625|RadiationDoseValue|Radiation Dose Value|FD|1||
300A0626|RadiationDoseSourceToSkinDistance|Radiation Dose Source to Skin Distance|FD|1||
300A0627|RadiationDoseMeasurementPointCoordinates|Radiation Dose Measurement Point Coordinates|FD|3||
300A0628|RadiationDoseSourceToExternalContourDistance|Radiation Dose Source to External Contour Distance|FD|1||
300A0629|RTToleranceSetSequence|RT Tolerance Set Sequence|SQ|1||
300A062A|RTToleranceSetLabel|RT Tolerance Set Label|LO|1||
300A062B|AttributeToleranceValuesSequence|Attribute Tolerance Values Sequence|SQ|1||
300A062C|ToleranceValue|Tolerance Value|FD|1||
300A062D|PatientSupportPositionToleranceSequence|Patient Support Position Tolerance Sequence|SQ|1||
300A062E|TreatmentTimeLimit|Treatment Time Limit|FD|1||
300A062F|CArmPhotonElectronControlPointSequence|C-Arm Photon-Electron Control Point Sequence|SQ|1||
300A0630|ReferencedRTRadiationSequence|Referenced RT Radiation Sequence|SQ|1||
300A0631|ReferencedRTInstanceSequence|Referenced RT Instance Sequence|SQ|1||
300A0632|ReferencedRTPatientSetupSequence|Referenced RT Patient Setup Sequence|SQ|1|R|
300A0634|SourceToPatientSurfaceDistance|Source to Patient Surface Distance|FD|1||
300A0635|TreatmentMachineSpecialModeCodeSequence|Treatment Machine Special Mode Code Sequence|SQ|1||
300A0636|IntendedNumberOfFractions|Intended Number of Fractions|US|1||
300A0637|RTRadiationSetIntent|RT Radiation Set Intent|CS|1||
300A0638|RTRadiationPhysicalAndGeometricContentDetailFlag|RT Radiation Physical and Geometric Content Detail Flag|CS|1||
300A0639|RTRecordFlag|RT Record Flag|CS|1||
300A063A|TreatmentDeviceIdentificationSequence|Treatment Device Identification Sequence|SQ|1||
300A063B|ReferencedRTPhysicianIntentSequence|Referenced RT Physician Intent Sequence|SQ|1||
300A063C|CumulativeMeterset|Cumulative Meterset|FD|1||
300A063D|DeliveryRate|Delivery Rate|FD|1||
300A063E|DeliveryRateUnitSequence|Delivery Rate Unit Sequence|SQ|1||
300A063F|TreatmentPositionSequence|Treatment Position Sequence|SQ|1||
300A0640|RadiationSourceAxisDistance|Radiation Source-Axis Distance|FD|1||
300A0641|NumberOfRTBeamLimitingDevices|Number of RT Beam Limiting Devices|US|1||
300A0642|RTBeamLimitingDeviceProximalDistance|RT Beam Limiting Device Proximal Distance|FD|1||
300A0643|RTBeamLimitingDeviceDistalDistance|RT Beam Limiting Device Distal Distance|FD|1||
300A0644|ParallelRTBeamDelimiterDeviceOrientationLabelCodeSequence|Parallel RT Beam Delimiter Device Orientation Label Code Sequence|SQ|1||
300A0645|BeamModifierOrientationAngle|Beam Modifier Orientation Angle|FD|1||
300A0646|FixedRTBeamDelimiterDeviceSequence|Fixed RT Beam Delimiter Device Sequence|SQ|1||
300A0647|ParallelRTBeamDelimiterDeviceSequence|Parallel RT Beam Delimiter Device Sequence|SQ|1||
300A0648|NumberOfParallelRTBeamDelimiters|Number of Parallel RT Beam Delimiters|US|1||
300A0649|ParallelRTBeamDelimiterBoundaries|Parallel RT Beam Delimiter Boundaries|FD|2-n||
300A064A|ParallelRTBeamDelimiterPositions|Parallel RT Beam Delimiter Positions|FD|2-n||
300A064B|RTBeamLimitingDeviceOffset|RT Beam Limiting Device Offset|FD|2||
300A064C|RTBeamDelimiterGeometrySequence|RT Beam Delimiter Geometry Sequence|SQ|1||
300A064D|RTBeamLimitingDeviceDefinitionSequence|RT Beam Limiting Device Definition Sequence|SQ|1||
300A064E|ParallelRTBeamDelimiterOpeningMode|Parallel RT Beam Delimiter Opening Mode|CS|1||
300A064F|ParallelRTBeamDelimiterLeafMountingSide|Parallel RT Beam Delimiter Leaf Mounting Side|CS|1-n||
300A0650|PatientSetupUID|Patient Setup UID|UI|1|R|
300A0651|WedgeDefinitionSequence|Wedge Definition Sequence|SQ|1||
300A0652|RadiationBeamWedgeAngle|Radiation Beam Wedge Angle|FD|1||
300A0653|RadiationBeamWedgeThinEdgeDistance|Radiation Beam Wedge Thin Edge Distance|FD|1||
300A0654|RadiationBeamEffectiveWedgeAngle|Radiation Beam Effective Wedge Angle|FD|1||
300A0655|NumberOfWedgePositions|Number of Wedge Positions|US|1||
300A0656|RTBeamLimitingDeviceOpeningSequence|RT Beam Limiting Device Opening Sequence|SQ|1||
300A0657|NumberOfRTBeamLimitingDeviceOpenings|Number of RT Beam Limiting Device Openings|US|1||
300A0658|RadiationDosimeterUnitSequence|Radiation Dosimeter Unit Sequence|SQ|1||
300A0659|RTDeviceDistanceReferenceLocationCodeSequence|RT Device Distance Reference Location Code Sequence|SQ|1||
300A065A|RadiationDeviceConfigurationAndCommissioningKeySequence|Radiation Device Configuration and Commissioning Key Sequence|SQ|1||
300A065B|PatientSupportPositionParameterSequence|Patient Support Position Parameter Sequence|SQ|1||
300A065C|PatientSupportPositionSpecificationMethod|Patient Support Position Specification Method|CS|1||
300A065D|PatientSupportPositionDeviceParameterSequence|Patient Support Position Device Parameter Sequence|SQ|1||
300A065E|DeviceOrderIndex|Device Order Index|US|1||
300A065F|PatientSupportPositionParameterOrderIndex|Patient Support Position Parameter Order Index|US|1||
300A0660|PatientSupportPositionDeviceToleranceSequence|Patient Support Position Device Tolerance Sequence|SQ|1||
300A0661|PatientSupportPositionToleranceOrderIndex|Patient Support Position Tolerance Order Index|US|1||
300A0662|CompensatorDefinitionSequence|Compensator Definition Sequence|SQ|1||
300A0663|CompensatorMapOrientation|Compensator Map Orientation|CS|1||
300A0664|CompensatorProximalThicknessMap|Compensator Proximal Thickness Map|OF|1||
300A0665|CompensatorDistalThicknessMap|Compensator Distal Thickness Map|OF|1||
300A0666|CompensatorBasePlaneOffset|Compensator Base Plane Offset|FD|1||
300A0667|CompensatorShapeFabricationCodeSequence|Compensator Shape Fabrication Code Sequence|SQ|1||
300A0668|CompensatorShapeSequence|Compensator Shape Sequence|SQ|1||
300A0669|RadiationBeamCompensatorMillingToolDiameter|Radiation Beam Compensator Milling Tool Diameter|FD|1||
300A066A|BlockDefinitionSequence|Block Definition Sequence|SQ|1||
300A066B|BlockEdgeData|Block Edge Data|OF|1||
300A066C|BlockOrientation|Block Orientation|CS|1||
300A066D|RadiationBeamBlockThickness|Radiation Beam Block Thickness|FD|1||
300A066E|RadiationBeamBlockSlabThickness|Radiation Beam Block Slab Thickness|FD|1||
300A066F|BlockEdgeDataSequence|Block Edge Data Sequence|SQ|1||
300A0670|NumberOfRTAccessoryHolders|Number of RT Accessory Holders|US|1||
300A0671|GeneralAccessoryDefinitionSequence|General Accessory Definition Sequence|SQ|1||
300A0672|NumberOfGeneralAccessories|Number of General Accessories|US|1||
300A0673|BolusDefinitionSequence|Bolus Definition Sequence|SQ|1||
300A0674|NumberOfBoluses|Number of Boluses|US|1||
300A0675|EquipmentFrameOfReferenceUID|Equipment Frame of Reference UID|UI|1||
300A0676|EquipmentFrameOfReferenceDescription|Equipment Frame of Reference Description|ST|1||
300A0677|EquipmentReferencePointCoordinatesSequence|Equipment Reference Point Coordinates Sequence|SQ|1||
300A0678|EquipmentReferencePointCodeSequence|Equipment Reference Point Code Sequence|SQ|1||
300A0679|RTBeamLimitingDeviceAngle|RT Beam Limiting Device Angle|FD|1||
300A067A|SourceRollAngle|Source Roll Angle|FD|1||
300A067B|RadiationGenerationModeSequence|Radiation GenerationMode Sequence|SQ|1||
300A067C|RadiationGenerationModeLabel|Radiation GenerationMode Label|SH|1||
300A067D|RadiationGenerationModeDescription|Radiation GenerationMode Description|ST|1||
300A067E|RadiationGenerationModeMachineCodeSequence|Radiation GenerationMode Machine Code Sequence|SQ|1||
300A067F|RadiationTypeCodeSequence|Radiation Type Code Sequence|SQ|1||
300A0680|NominalEnergy|Nominal Energy|DS|1||
300A0681|MinimumNominalEnergy|Minimum Nominal Energy|DS|1||
300A0682|MaximumNominalEnergy|Maximum Nominal Energy|DS|1||
300A0683|RadiationFluenceModifierCodeSequence|Radiation Fluence Modifier Code Sequence|SQ|1||
300A0684|EnergyUnitCodeSequence|Energy Unit Code Sequence|SQ|1||
300A0685|NumberOfRadiationGenerationModes|Number of Radiation GenerationModes|US|1||
300A0686|PatientSupportDevicesSequence|Patient Support Devices Sequence|SQ|1||
300A0687|NumberOfPatientSupportDevices|Number of Patient Support Devices|US|1||
300A0688|RTBeamModifierDefinitionDistance|RT Beam Modifier Definition Distance|FD|1||
300A0689|BeamAreaLimitSequence|Beam Area Limit Sequence|SQ|1||
300A068A|ReferencedRTPrescriptionSequence|Referenced RT Prescription Sequence|SQ|1||
300A068B|DoseValueInterpretation|Dose Value Interpretation|CS|1||
300A0700|TreatmentSessionUID|Treatment Session UID|UI|1||
300A0701|RTRadiationUsage|RT Radiation Usage|CS|1||
300A0702|ReferencedRTRadiationSetSequence|Referenced RT Radiation Set Sequence|SQ|1||
300A0703|ReferencedRTRadiationRecordSequence|Referenced RT Radiation Record Sequence|SQ|1||
300A0704|RTRadiationSetDeliveryNumber|RT Radiation Set Delivery Number|US|1||
300A0705|ClinicalFractionNumber|Clinical Fraction Number|US|1||
300A0706|RTTreatmentFractionCompletionStatus|RT Treatment Fraction Completion Status|CS|1||
300A0707|RTRadiationSetUsage|RT Radiation Set Usage|CS|1||
300A0708|TreatmentDeliveryContinuationFlag|Treatment Delivery Continuation Flag|CS|1||
300A0709|TreatmentRecordContentOrigin|Treatment Record Content Origin|CS|1||
300A0714|RTTreatmentTerminationStatus|RT Treatment Termination Status|CS|1||
300A0715|RTTreatmentTerminationReasonCodeSequence|RT Treatment Termination Reason Code Sequence|SQ|1||
300A0716|MachineSpecificTreatmentTerminationCodeSequence|Machine-Specific Treatment Termination Code Sequence|SQ|1||
300A0722|RTRadiationSalvageRecordControlPointSequence|RT Radiation Salvage Record Control Point Sequence|SQ|1||
300A0723|StartingMetersetValueKnownFlag|Starting Meterset Value Known Flag|CS|1||
300A0730|TreatmentTerminationDescription|Treatment Termination Description|ST|1||
300A0731|TreatmentToleranceViolationSequence|Treatment Tolerance Violation Sequence|SQ|1||
300A0732|TreatmentToleranceViolationCategory|Treatment Tolerance Violation Category|CS|1||
300A0733|TreatmentToleranceViolationAttributeSequence|Treatment Tolerance Violation Attribute Sequence|SQ|1||
300A0734|TreatmentToleranceViolationDescription|Treatment Tolerance Violation Description|ST|1||
300A0735|TreatmentToleranceViolationIdentification|Treatment Tolerance Violation Identification|ST|1||
300A0736|TreatmentToleranceViolationDateTime|Treatment Tolerance Violation DateTime|DT|1||
300A073A|RecordedRTControlPointDateTime|Recorded RT Control Point DateTime|DT|1||
300A073B|ReferencedRadiationRTControlPointIndex|Referenced Radiation RT Control Point Index|US|1||
300A073E|AlternateValueSequence|Alternate Value Sequence|SQ|1||
300A073F|ConfirmationSequence|Confirmation Sequence|SQ|1||
300A0740|InterlockSequence|Interlock Sequence|SQ|1||
300A0741|InterlockDateTime|Interlock DateTime|DT|1||
300A0742|InterlockDescription|Interlock Description|ST|1||
300A0743|InterlockOriginatingDeviceSequence|Interlock Originating Device Sequence|SQ|1||
300A0744|InterlockCodeSequence|Interlock Code Sequence|SQ|1||
300A0745|InterlockResolutionCodeSequence|Interlock Resolution Code Sequence|SQ|1||
300A0746|InterlockResolutionUserSequence|Interlock Resolution User Sequence|SQ|1||
300A0760|OverrideDateTime|Override DateTime|DT|1||
300A0761|TreatmentToleranceViolationTypeCodeSequence|Treatment Tolerance Violation Type Code Sequence|SQ|1||
300A0762|TreatmentToleranceViolationCauseCodeSequence|Treatment Tolerance Violation Cause Code Sequence|SQ|1||
300A0772|MeasuredMetersetToDoseMappingSequence|Measured Meterset to Dose Mapping Sequence|SQ|1||
300A0773|ReferencedExpectedInVivoMeasurementValueIndex|Referenced Expected In-Vivo Measurement Value Index|US|1||
300A0774|DoseMeasurementDeviceCodeSequence|Dose Measurement Device Code Sequence|SQ|1||
300A0780|AdditionalParameterRecordingInstanceSequence|Additional Parameter Recording Instance Sequence|SQ|1||
300A0782|||US|1|R|
300A0783|InterlockOriginDescription|Interlock Origin Description|ST|1||
300A0784|RTPatientPositionScopeSequence|RT Patient Position Scope Sequence|SQ|1||
300A0785|ReferencedTreatmentPositionGroupUID|Referenced Treatment Position Group UID|UI|1||
300A0786|RadiationOrderIndex|Radiation Order Index|US|1||
300A0787|OmittedRadiationSequence|Omitted Radiation Sequence|SQ|1||
300A0788|ReasonForOmissionCodeSequence|Reason for Omission Code Sequence|SQ|1||
300A0789|RTDeliveryStartPatientPositionSequence|RT Delivery Start Patient Position Sequence|SQ|1||
300A078A|RTTreatmentPreparationPatientPositionSequence|RT Treatment Preparation Patient Position Sequence|SQ|1||
300A078B|ReferencedRTTreatmentPreparationSequence|Referenced RT Treatment Preparation Sequence|SQ|1||
300A078C|ReferencedPatientSetupPhotoSequence|Referenced Patient Setup Photo Sequence|SQ|1||
300A078D|PatientTreatmentPreparationMethodCodeSequence|Patient Treatment Preparation Method Code Sequence|SQ|1||
300A078E|PatientTreatmentPreparationProcedureParameterDescription|Patient Treatment Preparation Procedure Parameter Description|LT|1||
300A078F|PatientTreatmentPreparationDeviceSequence|Patient Treatment Preparation Device Sequence|SQ|1||
300A0790|PatientTreatmentPreparationProcedureSequence|Patient Treatment Preparation Procedure Sequence|SQ|1||
300A0791|PatientTreatmentPreparationProcedureCodeSequence|Patient Treatment Preparation Procedure Code Sequence|SQ|1||
300A0792|PatientTreatmentPreparationMethodDescription|Patient Treatment Preparation Method Description|LT|1||
300A0793|PatientTreatmentPreparationProcedureParameterSequence|Patient Treatment Preparation Procedure Parameter Sequence|SQ|1||
300A0794|PatientSetupPhotoDescription|Patient Setup Photo Description|LT|1||
300A0795|PatientTreatmentPreparationProcedureIndex|Patient Treatment Preparation Procedure Index|US|1||
300A0796|ReferencedPatientSetupProcedureIndex|Referenced Patient Setup Procedure Index|US|1||
300A0797|RTRadiationTaskSequence|RT Radiation Task Sequence|SQ|1||
300A0798|RTPatientPositionDisplacementSequence|RT Patient Position Displacement Sequence|SQ|1||
300A0799|RTPatientPositionSequence|RT Patient Position Sequence|SQ|1||
300A079A|DisplacementReferenceLabel|Displacement Reference Label|LO|1||
300A079B|DisplacementMatrix|Displacement Matrix|FD|16||
300A079C|PatientSupportDisplacementSequence|Patient Support Displacement Sequence|SQ|1||
300A079D|DisplacementReferenceLocationCodeSequence|Displacement Reference Location Code Sequence|SQ|1||
300A079E|RTRadiationSetDeliveryUsage|RT Radiation Set Delivery Usage|CS|1||
300A079F|PatientTreatmentPreparationSequence|Patient Treatment Preparation Sequence|SQ|1||
300A07A0|PatientToEquipmentRelationshipSequence|Patient to Equipment Relationship Sequence|SQ|1||
300A07A1|ImagingEquipmentToTreatmentDeliveryDeviceRelationshipSequence|Imaging Equipment to Treatment Delivery Device Relationship Sequence|SQ|1||
300C0002|ReferencedRTPlanSequence|Referenced RT Plan Sequence|SQ|1||
300C0004|ReferencedBeamSequence|Referenced Beam Sequence|SQ|1||
300C0006|ReferencedBeamNumber|Referenced Beam Number|IS|1||
300C0007|ReferencedReferenceImageNumber|Referenced Reference Image Number|IS|1||
300C0008|StartCumulativeMetersetWeight|Start Cumulative Meterset Weight|DS|1||
300C0009|EndCumulativeMetersetWeight|End Cumulative Meterset Weight|DS|1||
300C000A|ReferencedBrachyApplicationSetupSequence|Referenced Brachy Application Setup Sequence|SQ|1||
300C000C|ReferencedBrachyApplicationSetupNumber|Referenced Brachy Application Setup Number|IS|1||
300C000E|ReferencedSourceNumber|Referenced Source Number|IS|1||
300C0020|ReferencedFractionGroupSequence|Referenced Fraction Group Sequence|SQ|1||
300C0022|ReferencedFractionGroupNumber|Referenced Fraction Group Number|IS|1||
300C0040|ReferencedVerificationImageSequence|Referenced Verification Image Sequence|SQ|1||
300C0042|ReferencedReferenceImageSequence|Referenced Reference Image Sequence|SQ|1||
300C0050|ReferencedDoseReferenceSequence|Referenced Dose Reference Sequence|SQ|1||
300C0051|ReferencedDoseReferenceNumber|Referenced Dose Reference Number|IS|1||
300C0055|BrachyReferencedDoseReferenceSequence|Brachy Referenced Dose Reference Sequence|SQ|1||
300C0060|ReferencedStructureSetSequence|Referenced Structure Set Sequence|SQ|1||
300C006A|ReferencedPatientSetupNumber|Referenced Patient Setup Number|IS|1||
300C0080|ReferencedDoseSequence|Referenced Dose Sequence|SQ|1||
300C00A0|ReferencedToleranceTableNumber|Referenced Tolerance Table Number|IS|1||
300C00B0|ReferencedBolusSequence|Referenced Bolus Sequence|SQ|1||
300C00C0|ReferencedWedgeNumber|Referenced Wedge Number|IS|1||
300C00D0|ReferencedCompensatorNumber|Referenced Compensator Number|IS|1||
300C00E0|ReferencedBlockNumber|Referenced Block Number|IS|1||
300C00F0|ReferencedControlPointIndex|Referenced Control Point Index|IS|1||
300C00F2|ReferencedControlPointSequence|Referenced Control Point Sequence|SQ|1||
300C00F4|ReferencedStartControlPointIndex|Referenced Start Control Point Index|IS|1||
300C00F6|ReferencedStopControlPointIndex|Referenced Stop Control Point Index|IS|1||
300C0100|ReferencedRangeShifterNumber|Referenced Range Shifter Number|IS|1||
300C0102|ReferencedLateralSpreadingDeviceNumber|Referenced Lateral Spreading Device Number|IS|1||
300C0104|ReferencedRangeModulatorNumber|Referenced Range Modulator Number|IS|1||
300C0111|OmittedBeamTaskSequence|Omitted Beam Task Sequence|SQ|1||
300C0112|ReasonForOmission|Reason for Omission|CS|1||
300C0113|ReasonForOmissionDescription|Reason for Omission Description|LO|1||
300C0114|PrescriptionOverviewSequence|Prescription Overview Sequence|SQ|1||
300C0115|TotalPrescriptionDose|Total Prescription Dose|FL|1||
300C0116|PlanOverviewSequence|Plan Overview Sequence|SQ|1||
300C0117|PlanOverviewIndex|Plan Overview Index|US|1||
300C0118|ReferencedPlanOverviewIndex|Referenced Plan Overview Index|US|1||
300C0119|NumberOfFractionsIncluded|Number of Fractions Included|US|1||
300C0120|DoseCalibrationConditionsSequence|Dose Calibration Conditions Sequence|SQ|1||
300C0121|AbsorbedDoseToMetersetRatio|Absorbed Dose to Meterset Ratio|FD|1||
300C0122|DelineatedRadiationFieldSize|Delineated Radiation Field Size|FD|2||
300C0123|DoseCalibrationConditionsVerifiedFlag|Dose Calibration Conditions Verified Flag|CS|1||
300C0124|CalibrationReferencePointDepth|Calibration Reference Point Depth|FD|1||
300C0125|GatingBeamHoldTransitionSequence|Gating Beam Hold Transition Sequence|SQ|1||
300C0126|BeamHoldTransition|Beam Hold Transition|CS|1||
300C0127|BeamHoldTransitionDateTime|Beam Hold Transition DateTime|DT|1||
300C0128|BeamHoldOriginatingDeviceSequence|Beam Hold Originating Device Sequence|SQ|1||
300C0129|BeamHoldTransitionTriggerSource|Beam Hold Transition Trigger Source|CS|1||
300E0002|ApprovalStatus|Approval Status|CS|1||
300E0004|ReviewDate|Review Date|DA|1||
300E0005|ReviewTime|Review Time|TM|1||
300E0008|ReviewerName|Reviewer Name|PN|1||
30100001|RadiobiologicalDoseEffectSequence|Radiobiological Dose Effect Sequence|SQ|1||
30100002|RadiobiologicalDoseEffectFlag|Radiobiological Dose Effect Flag|CS|1||
30100003|EffectiveDoseCalculationMethodCategoryCodeSequence|Effective Dose Calculation Method Category Code Sequence|SQ|1||
30100004|EffectiveDoseCalculationMethodCodeSequence|Effective Dose Calculation Method Code Sequence|SQ|1||
30100005|EffectiveDoseCalculationMethodDescription|Effective Dose Calculation Method Description|LO|1||
30100006|ConceptualVolumeUID|Conceptual Volume UID|UI|1||
30100007|OriginatingSOPInstanceReferenceSequence|Originating SOP Instance Reference Sequence|SQ|1||
30100008|ConceptualVolumeConstituentSequence|Conceptual Volume Constituent Sequence|SQ|1||
30100009|EquivalentConceptualVolumeInstanceReferenceSequence|Equivalent Conceptual Volume Instance Reference Sequence|SQ|1||
3010000A|EquivalentConceptualVolumesSequence|Equivalent Conceptual Volumes Sequence|SQ|1||
3010000B|ReferencedConceptualVolumeUID|Referenced Conceptual Volume UID|UI|1||
3010000C|ConceptualVolumeCombinationExpression|Conceptual Volume Combination Expression|UT|1||
3010000D|ConceptualVolumeConstituentIndex|Conceptual Volume Constituent Index|US|1||
3010000E|ConceptualVolumeCombinationFlag|Conceptual Volume Combination Flag|CS|1||
3010000F|ConceptualVolumeCombinationDescription|Conceptual Volume Combination Description|ST|1||
30100010|ConceptualVolumeSegmentationDefinedFlag|Conceptual Volume Segmentation Defined Flag|CS|1||
30100011|ConceptualVolumeSegmentationReferenceSequence|Conceptual Volume Segmentation Reference Sequence|SQ|1||
30100012|ConceptualVolumeConstituentSegmentationReferenceSequence|Conceptual Volume Constituent Segmentation Reference Sequence|SQ|1||
30100013|ConstituentConceptualVolumeUID|Constituent Conceptual Volume UID|UI|1||
30100014|DerivationConceptualVolumeSequence|Derivation Conceptual Volume Sequence|SQ|1||
30100015|SourceConceptualVolumeUID|Source Conceptual Volume UID|UI|1||
30100016|ConceptualVolumeDerivationAlgorithmSequence|Conceptual Volume Derivation Algorithm Sequence|SQ|1||
30100017|ConceptualVolumeDescription|Conceptual Volume Description|ST|1||
30100018|SourceConceptualVolumeSequence|Source Conceptual Volume Sequence|SQ|1||
30100019|AuthorIdentificationSequence|Author Identification Sequence|SQ|1||
3010001A|ManufacturerModelVersion|Manufacturer's Model Version|LO|1||
3010001B|DeviceAlternateIdentifier|Device Alternate Identifier|UC|1||
3010001C|DeviceAlternateIdentifierType|Device Alternate Identifier Type|CS|1||
3010001D|DeviceAlternateIdentifierFormat|Device Alternate Identifier Format|LT|1||
3010001E|SegmentationCreationTemplateLabel|Segmentation Creation Template Label|LO|1||
3010001F|SegmentationTemplateUID|Segmentation Template UID|UI|1||
30100020|ReferencedSegmentReferenceIndex|Referenced Segment Reference Index|US|1||
30100021|SegmentReferenceSequence|Segment Reference Sequence|SQ|1||
30100022|SegmentReferenceIndex|Segment Reference Index|US|1||
30100023|DirectSegmentReferenceSequence|Direct Segment Reference Sequence|SQ|1||
30100024|CombinationSegmentReferenceSequence|Combination Segment Reference Sequence|SQ|1||
30100025|ConceptualVolumeSequence|Conceptual Volume Sequence|SQ|1||
30100026|SegmentedRTAccessoryDeviceSequence|Segmented RT Accessory Device Sequence|SQ|1||
30100027|SegmentCharacteristicsSequence|Segment Characteristics Sequence|SQ|1||
30100028|RelatedSegmentCharacteristicsSequence|Related Segment Characteristics Sequence|SQ|1||
30100029|SegmentCharacteristicsPrecedence|Segment Characteristics Precedence|US|1||
3010002A|RTSegmentAnnotationSequence|RT Segment Annotation Sequence|SQ|1||
3010002B|SegmentAnnotationCategoryCodeSequence|Segment Annotation Category Code Sequence|SQ|1||
3010002C|SegmentAnnotationTypeCodeSequence|Segment Annotation Type Code Sequence|SQ|1||
3010002D|DeviceLabel|Device Label|LO|1||
3010002E|DeviceTypeCodeSequence|Device Type Code Sequence|SQ|1||
3010002F|SegmentAnnotationTypeModifierCodeSequence|Segment Annotation Type Modifier Code Sequence|SQ|1||
30100030|PatientEquipmentRelationshipCodeSequence|Patient Equipment Relationship Code Sequence|SQ|1||
30100031|ReferencedFiducialsUID|Referenced Fiducials UID|UI|1||
30100032|PatientTreatmentOrientationSequence|Patient Treatment Orientation Sequence|SQ|1||
30100033|UserContentLabel|User Content Label|SH|1||
30100034|UserContentLongLabel|User Content Long Label|LO|1||
30100035|EntityLabel|Entity Label|SH|1||
30100036|EntityName|Entity Name|LO|1||
30100037|EntityDescription|Entity Description|ST|1||
30100038|EntityLongLabel|Entity Long Label|LO|1||
30100039|DeviceIndex|Device Index|US|1||
3010003A|RTTreatmentPhaseIndex|RT Treatment Phase Index|US|1||
3010003B|RTTreatmentPhaseUID|RT Treatment Phase UID|UI|1||
3010003C|RTPrescriptionIndex|RT Prescription Index|US|1||
3010003D|RTSegmentAnnotationIndex|RT Segment Annotation Index|US|1||
3010003E|BasisRTTreatmentPhaseIndex|Basis RT Treatment Phase Index|US|1||
3010003F|RelatedRTTreatmentPhaseIndex|Related RT Treatment Phase Index|US|1||
30100040|ReferencedRTTreatmentPhaseIndex|Referenced RT Treatment Phase Index|US|1||
30100041|ReferencedRTPrescriptionIndex|Referenced RT Prescription Index|US|1||
30100042|ReferencedParentRTPrescriptionIndex|Referenced Parent RT Prescription Index|US|1||
30100043|ManufacturerDeviceIdentifier|Manufacturer's Device Identifier|ST|1||
30100044|InstanceLevelReferencedPerformedProcedureStepSequence|Instance-Level Referenced Performed Procedure Step Sequence|SQ|1||
30100045|RTTreatmentPhaseIntentPresenceFlag|RT Treatment Phase Intent Presence Flag|CS|1||
30100046|RadiotherapyTreatmentType|Radiotherapy Treatment Type|CS|1||
30100047|TeletherapyRadiationType|Teletherapy Radiation Type|CS|1-n||
30100048|BrachytherapySourceType|Brachytherapy Source Type|CS|1-n||
30100049|ReferencedRTTreatmentPhaseSequence|Referenced RT Treatment Phase Sequence|SQ|1||
3010004A|ReferencedDirectSegmentInstanceSequence|Referenced Direct Segment Instance Sequence|SQ|1||
3010004B|IntendedRTTreatmentPhaseSequence|Intended RT Treatment Phase Sequence|SQ|1||
3010004C|IntendedPhaseStartDate|Intended Phase Start Date|DA|1||
3010004D|IntendedPhaseEndDate|Intended Phase End Date|DA|1||
3010004E|RTTreatmentPhaseIntervalSequence|RT Treatment Phase Interval Sequence|SQ|1||
3010004F|TemporalRelationshipIntervalAnchor|Temporal Relationship Interval Anchor|CS|1||
30100050|MinimumNumberOfIntervalDays|Minimum Number of Interval Days|FD|1||
30100051|MaximumNumberOfIntervalDays|Maximum Number of Interval Days|FD|1||
30100052|PertinentSOPClassesInStudy|Pertinent SOP Classes in Study|UI|1-n||
30100053|PertinentSOPClassesInSeries|Pertinent SOP Classes in Series|UI|1-n||
30100054|RTPrescriptionLabel|RT Prescription Label|LO|1||
30100055|RTPhysicianIntentPredecessorSequence|RT Physician Intent Predecessor Sequence|SQ|1||
30100056|RTTreatmentApproachLabel|RT Treatment Approach Label|LO|1||
30100057|RTPhysicianIntentSequence|RT Physician Intent Sequence|SQ|1||
30100058|RTPhysicianIntentIndex|RT Physician Intent Index|US|1||
30100059|RTTreatmentIntentType|RT Treatment Intent Type|CS|1||
3010005A|RTPhysicianIntentNarrative|RT Physician Intent Narrative|UT|1||
3010005B|RTProtocolCodeSequence|RT Protocol Code Sequence|SQ|1||
3010005C|ReasonForSuperseding|Reason for Superseding|ST|1||
3010005D|RTDiagnosisCodeSequence|RT Diagnosis Code Sequence|SQ|1||
3010005E|ReferencedRTPhysicianIntentIndex|Referenced RT Physician Intent Index|US|1||
3010005F|RTPhysicianIntentInputInstanceSequence|RT Physician Intent Input Instance Sequence|SQ|1||
30100060|RTAnatomicPrescriptionSequence|RT Anatomic Prescription Sequence|SQ|1||
30100061|PriorTreatmentDoseDescription|Prior Treatment Dose Description|UT|1||
30100062|PriorTreatmentReferenceSequence|Prior Treatment Reference Sequence|SQ|1||
30100063|DosimetricObjectiveEvaluationScope|Dosimetric Objective Evaluation Scope|CS|1||
30100064|TherapeuticRoleCategoryCodeSequence|Therapeutic Role Category Code Sequence|SQ|1||
30100065|TherapeuticRoleTypeCodeSequence|Therapeutic Role Type Code Sequence|SQ|1||
30100066|ConceptualVolumeOptimizationPrecedence|Conceptual Volume Optimization Precedence|US|1||
30100067|ConceptualVolumeCategoryCodeSequence|Conceptual Volume Category Code Sequence|SQ|1||
30100068|ConceptualVolumeBlockingConstraint|Conceptual Volume Blocking Constraint|CS|1||
30100069|ConceptualVolumeTypeCodeSequence|Conceptual Volume Type Code Sequence|SQ|1||
3010006A|ConceptualVolumeTypeModifierCodeSequence|Conceptual Volume Type Modifier Code Sequence|SQ|1||
3010006B|RTPrescriptionSequence|RT Prescription Sequence|SQ|1||
3010006C|DosimetricObjectiveSequence|Dosimetric Objective Sequence|SQ|1||
3010006D|DosimetricObjectiveTypeCodeSequence|Dosimetric Objective Type Code Sequence|SQ|1||
3010006E|DosimetricObjectiveUID|Dosimetric Objective UID|UI|1||
3010006F|ReferencedDosimetricObjectiveUID|Referenced Dosimetric Objective UID|UI|1||
30100070|DosimetricObjectiveParameterSequence|Dosimetric Objective Parameter Sequence|SQ|1||
30100071|ReferencedDosimetricObjectivesSequence|Referenced Dosimetric Objectives Sequence|SQ|1||
30100073|AbsoluteDosimetricObjectiveFlag|Absolute Dosimetric Objective Flag|CS|1||
30100074|DosimetricObjectiveWeight|Dosimetric Objective Weight|FD|1||
30100075|DosimetricObjectivePurpose|Dosimetric Objective Purpose|CS|1||
30100076|PlanningInputInformationSequence|Planning Input Information Sequence|SQ|1||
30100077|TreatmentSite|Treatment Site|LO|1||
30100078|TreatmentSiteCodeSequence|Treatment Site Code Sequence|SQ|1||
30100079|FractionPatternSequence|Fraction Pattern Sequence|SQ|1||
3010007A|TreatmentTechniqueNotes|Treatment Technique Notes|UT|1||
3010007B|PrescriptionNotes|Prescription Notes|UT|1||
3010007C|NumberOfIntervalFractions|Number of Interval Fractions|IS|1||
3010007D|NumberOfFractions|Number of Fractions|US|1||
3010007E|IntendedDeliveryDuration|Intended Delivery Duration|US|1||
3010007F|FractionationNotes|Fractionation Notes|UT|1||
30100080|RTTreatmentTechniqueCodeSequence|RT Treatment Technique Code Sequence|SQ|1||
30100081|PrescriptionNotesSequence|Prescription Notes Sequence|SQ|1||
30100082|FractionBasedRelationshipSequence|Fraction-Based Relationship Sequence|SQ|1||
30100083|FractionBasedRelationshipIntervalAnchor|Fraction-Based Relationship Interval Anchor|CS|1||
30100084|MinimumHoursBetweenFractions|Minimum Hours between Fractions|FD|1||
30100085|IntendedFractionStartTime|Intended Fraction Start Time|TM|1-n||
30100086|IntendedStartDayOfWeek|Intended Start Day of Week|LT|1||
30100087|WeekdayFractionPatternSequence|Weekday Fraction Pattern Sequence|SQ|1||
30100088|DeliveryTimeStructureCodeSequence|Delivery Time Structure Code Sequence|SQ|1||
30100089|TreatmentSiteModifierCodeSequence|Treatment Site Modifier Code Sequence|SQ|1||
30100090|RoboticBaseLocationIndicator|Robotic Base Location Indicator|CS|1|R|
30100091|RoboticPathNodeSetCodeSequence|Robotic Path Node Set Code Sequence|SQ|1||
30100092|RoboticNodeIdentifier|Robotic Node Identifier|UL|1||
30100093|RTTreatmentSourceCoordinates|RT Treatment Source Coordinates|FD|3||
30100094|RadiationSourceCoordinateSystemYawAngle|Radiation Source Coordinate SystemYaw Angle|FD|1||
30100095|RadiationSourceCoordinateSystemRollAngle|Radiation Source Coordinate SystemRoll Angle|FD|1||
30100096|RadiationSourceCoordinateSystemPitchAngle|Radiation Source Coordinate System Pitch Angle|FD|1||
30100097|RoboticPathControlPointSequence|Robotic Path Control Point Sequence|SQ|1||
30100098|TomotherapeuticControlPointSequence|Tomotherapeutic Control Point Sequence|SQ|1||
30100099|TomotherapeuticLeafOpenDurations|Tomotherapeutic Leaf Open Durations|FD|1-n||
3010009A|TomotherapeuticLeafInitialClosedDurations|Tomotherapeutic Leaf Initial Closed Durations|FD|1-n||
301000A0|ConceptualVolumeIdentificationSequence|Conceptual Volume Identification Sequence|SQ|1||
40000010|Arbitrary|Arbitrary|LT|1|R|
40004000|TextComments|Text Comments|LT|1|R|
40080040|ResultsID|Results ID|SH|1|R|
40080042|ResultsIDIssuer|Results ID Issuer|LO|1|R|
40080050|ReferencedInterpretationSequence|Referenced Interpretation Sequence|SQ|1|R|
400800FF|ReportProductionStatusTrial|Report Production Status (Trial)|CS|1|R|
40080100|InterpretationRecordedDate|Interpretation Recorded Date|DA|1|R|
40080101|InterpretationRecordedTime|Interpretation Recorded Time|TM|1|R|
40080102|InterpretationRecorder|Interpretation Recorder|PN|1|R|
40080103|ReferenceToRecordedSound|Reference to Recorded Sound|LO|1|R|
40080108|InterpretationTranscriptionDate|Interpretation Transcription Date|DA|1|R|
40080109|InterpretationTranscriptionTime|Interpretation Transcription Time|TM|1|R|
4008010A|InterpretationTranscriber|Interpretation Transcriber|PN|1|R|
4008010B|InterpretationText|Interpretation Text|ST|1|R|
4008010C|InterpretationAuthor|Interpretation Author|PN|1|R|
40080111|InterpretationApproverSequence|Interpretation Approver Sequence|SQ|1|R|
40080112|InterpretationApprovalDate|Interpretation Approval Date|DA|1|R|
40080113|InterpretationApprovalTime|Interpretation Approval Time|TM|1|R|
40080114|PhysicianApprovingInterpretation|Physician Approving Interpretation|PN|1|R|
40080115|InterpretationDiagnosisDescription|Interpretation Diagnosis Description|LT|1|R|
40080117|InterpretationDiagnosisCodeSequence|Interpretation Diagnosis Code Sequence|SQ|1|R|
40080118|ResultsDistributionListSequence|Results Distribution List Sequence|SQ|1|R|
40080119|DistributionName|Distribution Name|PN|1|R|
4008011A|DistributionAddress|Distribution Address|LO|1|R|
40080200|InterpretationID|Interpretation ID|SH|1|R|
40080202|InterpretationIDIssuer|Interpretation ID Issuer|LO|1|R|
40080210|InterpretationTypeID|Interpretation Type ID|CS|1|R|
40080212|InterpretationStatusID|Interpretation Status ID|CS|1|R|
40080300|Impressions|Impressions|ST|1|R|
40084000|ResultsComments|Results Comments|ST|1|R|
40100001|LowEnergyDetectors|Low Energy Detectors|CS|1||
40100002|HighEnergyDetectors|High Energy Detectors|CS|1||
40100004|DetectorGeometrySequence|Detector Geometry Sequence|SQ|1||
40101001|ThreatROIVoxelSequence|Threat ROI Voxel Sequence|SQ|1||
40101004|ThreatROIBase|Threat ROI Base|FL|3||
40101005|ThreatROIExtents|Threat ROI Extents|FL|3||
40101006|ThreatROIBitmap|Threat ROI Bitmap|OB|1||
40101007|RouteSegmentID|Route Segment ID|SH|1||
40101008|GantryType|Gantry Type|CS|1||
40101009|OOIOwnerType|OOI Owner Type|CS|1||
4010100A|RouteSegmentSequence|Route Segment Sequence|SQ|1||
40101010|PotentialThreatObjectID|Potential Threat Object ID|US|1||
40101011|ThreatSequence|Threat Sequence|SQ|1||
40101012|ThreatCategory|Threat Category|CS|1||
40101013|ThreatCategoryDescription|Threat Category Description|LT|1||
40101014|ATDAbilityAssessment|ATD Ability Assessment|CS|1||
40101015|ATDAssessmentFlag|ATD Assessment Flag|CS|1||
40101016|ATDAssessmentProbability|ATD Assessment Probability|FL|1||
40101017|Mass|Mass|FL|1||
40101018|Density|Density|FL|1||
40101019|ZEffective|Z Effective|FL|1||
4010101A|BoardingPassID|Boarding Pass ID|SH|1||
4010101B|CenterOfMass|Center of Mass|FL|3||
4010101C|CenterOfPTO|Center of PTO|FL|3||
4010101D|BoundingPolygon|Bounding Polygon|FL|6-n||
4010101E|RouteSegmentStartLocationID|Route Segment Start Location ID|SH|1||
4010101F|RouteSegmentEndLocationID|Route Segment End Location ID|SH|1||
40101020|RouteSegmentLocationIDType|Route Segment Location ID Type|CS|1||
40101021|AbortReason|Abort Reason|CS|1-n||
40101023|VolumeOfPTO|Volume of PTO|FL|1||
40101024|AbortFlag|Abort Flag|CS|1||
40101025|RouteSegmentStartTime|Route Segment Start Time|DT|1||
40101026|RouteSegmentEndTime|Route Segment End Time|DT|1||
40101027|TDRType|TDR Type|CS|1||
40101028|InternationalRouteSegment|International Route Segment|CS|1||
40101029|ThreatDetectionAlgorithmAndVersion|Threat Detection Algorithm and Version|LO|1-n||
4010102A|AssignedLocation|Assigned Location|SH|1||
4010102B|AlarmDecisionTime|Alarm Decision Time|DT|1||
40101031|AlarmDecision|Alarm Decision|CS|1||
40101033|NumberOfTotalObjects|Number of Total Objects|US|1||
40101034|NumberOfAlarmObjects|Number of Alarm Objects|US|1||
40101037|PTORepresentationSequence|PTO Representation Sequence|SQ|1||
40101038|ATDAssessmentSequence|ATD Assessment Sequence|SQ|1||
40101039|TIPType|TIP Type|CS|1||
4010103A|DICOSVersion|DICOS Version|CS|1||
40101041|OOIOwnerCreationTime|OOI Owner Creation Time|DT|1||
40101042|OOIType|OOI Type|CS|1||
40101043|OOISize|OOI Size|FL|3||
40101044|AcquisitionStatus|Acquisition Status|CS|1||
40101045|BasisMaterialsCodeSequence|Basis Materials Code Sequence|SQ|1||
40101046|PhantomType|Phantom Type|CS|1||
40101047|OOIOwnerSequence|OOI Owner Sequence|SQ|1||
40101048|ScanType|Scan Type|CS|1||
40101051|ItineraryID|Itinerary ID|LO|1||
40101052|ItineraryIDType|Itinerary ID Type|SH|1||
40101053|ItineraryIDAssigningAuthority|Itinerary ID Assigning Authority|LO|1||
40101054|RouteID|Route ID|SH|1||
40101055|RouteIDAssigningAuthority|Route ID Assigning Authority|SH|1||
40101056|InboundArrivalType|Inbound Arrival Type|CS|1||
40101058|CarrierID|Carrier ID|SH|1||
40101059|CarrierIDAssigningAuthority|Carrier ID Assigning Authority|CS|1||
40101060|SourceOrientation|Source Orientation|FL|3||
40101061|SourcePosition|Source Position|FL|3||
40101062|BeltHeight|Belt Height|FL|1||
40101064|AlgorithmRoutingCodeSequence|Algorithm Routing Code Sequence|SQ|1||
40101067|TransportClassification|Transport Classification|CS|1||
40101068|OOITypeDescriptor|OOI Type Descriptor|LT|1||
40101069|TotalProcessingTime|Total Processing Time|FL|1||
4010106C|DetectorCalibrationData|Detector Calibration Data|OB|1||
4010106D|AdditionalScreeningPerformed|Additional Screening Performed|CS|1||
4010106E|AdditionalInspectionSelectionCriteria|Additional Inspection Selection Criteria|CS|1||
4010106F|AdditionalInspectionMethodSequence|Additional Inspection Method Sequence|SQ|1||
40101070|AITDeviceType|AIT Device Type|CS|1||
40101071|QRMeasurementsSequence|QR Measurements Sequence|SQ|1||
40101072|TargetMaterialSequence|Target Material Sequence|SQ|1||
40101073|SNRThreshold|SNR Threshold|FD|1||
40101075|ImageScaleRepresentation|Image Scale Representation|DS|1||
40101076|ReferencedPTOSequence|Referenced PTO Sequence|SQ|1||
40101077|ReferencedTDRInstanceSequence|Referenced TDR Instance Sequence|SQ|1||
40101078|PTOLocationDescription|PTO Location Description|ST|1||
40101079|AnomalyLocatorIndicatorSequence|Anomaly Locator Indicator Sequence|SQ|1||
4010107A|AnomalyLocatorIndicator|Anomaly Locator Indicator|FL|3||
4010107B|PTORegionSequence|PTO Region Sequence|SQ|1||
4010107C|InspectionSelectionCriteria|Inspection Selection Criteria|CS|1||
4010107D|SecondaryInspectionMethodSequence|Secondary Inspection Method Sequence|SQ|1||
4010107E|PRCSToRCSOrientation|PRCS to RCS Orientation|DS|6||
4FFE0001|MACParametersSequence|MAC Parameters Sequence|SQ|1||
50xx0005|CurveDimensions|Curve Dimensions|US|1|R|x
50xx0010|NumberOfPoints|Number of Points|US|1|R|x
50xx0020|TypeOfData|Type of Data|CS|1|R|x
50xx0022|CurveDescription|Curve Description|LO|1|R|x
50xx0030|AxisUnits|Axis Units|SH|1-n|R|x
50xx0040|AxisLabels|Axis Labels|SH|1-n|R|x
50xx0103|DataValueRepresentation|Data Value Representation|US|1|R|x
50xx0104|MinimumCoordinateValue|Minimum Coordinate Value|US|1-n|R|x
50xx0105|MaximumCoordinateValue|Maximum Coordinate Value|US|1-n|R|x
50xx0106|CurveRange|Curve Range|SH|1-n|R|x
50xx0110|CurveDataDescriptor|Curve Data Descriptor|US|1-n|R|x
50xx0112|CoordinateStartValue|Coordinate Start Value|US|1-n|R|x
50xx0114|CoordinateStepValue|Coordinate Step Value|US|1-n|R|x
50xx1001|CurveActivationLayer|Curve Activation Layer|CS|1|R|x
50xx2000|AudioType|Audio Type|US|1|R|x
50xx2002|AudioSampleFormat|Audio Sample Format|US|1|R|x
50xx2004|NumberOfChannels|Number of Channels|US|1|R|x
50xx2006|NumberOfSamples|Number of Samples|UL|1|R|x
50xx2008|SampleRate|Sample Rate|UL|1|R|x
50xx200a|TotalTime|Total Time|UL|1|R|x
50xx200c|AudioSampleData|Audio Sample Data|OB/OW|1|R|x
50xx200e|AudioComments|Audio Comments|LT|1|R|x
50xx2500|CurveLabel|Curve Label|LO|1|R|x
50xx2600|CurveReferencedOverlaySequence|Curve Referenced Overlay Sequence|SQ|1|R|x
50xx2610|CurveReferencedOverlayGroup|Curve Referenced Overlay Group|US|1|R|x
50xx3000|CurveData|Curve Data|OB/OW|1|R|x
52009229|SharedFunctionalGroupsSequence|Shared Functional Groups Sequence|SQ|1||
52009230|PerFrameFunctionalGroupsSequence|Per-Frame Functional Groups Sequence|SQ|1||
54000100|WaveformSequence|Waveform Sequence|SQ|1||
54000110|ChannelMinimumValue|Channel Minimum Value|OB/OW|1||
54000112|ChannelMaximumValue|Channel Maximum Value|OB/OW|1||
54001004|WaveformBitsAllocated|Waveform Bits Allocated|US|1||
54001006|WaveformSampleInterpretation|Waveform Sample Interpretation|CS|1||
5400100A|WaveformPaddingValue|Waveform Padding Value|OB/OW|1||
54001010|WaveformData|Waveform Data|OB/OW|1||
56000010|FirstOrderPhaseCorrectionAngle|First Order Phase Correction Angle|OF|1||
56000020|SpectroscopyData|Spectroscopy Data|OF|1||
60xx0010|OverlayRows|Overlay Rows|US|1||x
60xx0011|OverlayColumns|Overlay Columns|US|1||x
60xx0012|OverlayPlanes|Overlay Planes|US|1|R|x
60xx0015|NumberOfFramesInOverlay|Number of Frames in Overlay|IS|1||x
60xx0022|OverlayDescription|Overlay Description|LO|1||x
60xx0040|OverlayType|Overlay Type|CS|1||x
60xx0045|OverlaySubtype|Overlay Subtype|LO|1||x
60xx0050|OverlayOrigin|Overlay Origin|SS|2||x
60xx0051|ImageFrameOrigin|Image Frame Origin|US|1||x
60xx0052|OverlayPlaneOrigin|Overlay Plane Origin|US|1|R|x
60xx0060|OverlayCompressionCode|Overlay Compression Code|CS|1|R|x
60xx0061|OverlayCompressionOriginator|Overlay Compression Originator|SH|1|R|x
60xx0062|OverlayCompressionLabel|Overlay Compression Label|SH|1|R|x
60xx0063|OverlayCompressionDescription|Overlay Compression Description|CS|1|R|x
60xx0066|OverlayCompressionStepPointers|Overlay Compression Step Pointers|AT|1-n|R|x
60xx0068|OverlayRepeatInterval|Overlay Repeat Interval|US|1|R|x
60xx0069|OverlayBitsGrouped|Overlay Bits Grouped|US|1|R|x
60xx0100|OverlayBitsAllocated|Overlay Bits Allocated|US|1||x
60xx0102|OverlayBitPosition|Overlay Bit Position|US|1||x
60xx0110|OverlayFormat|Overlay Format|CS|1|R|x
60xx0200|OverlayLocation|Overlay Location|US|1|R|x
60xx0800|OverlayCodeLabel|Overlay Code Label|CS|1-n|R|x
60xx0802|OverlayNumberOfTables|Overlay Number of Tables|US|1|R|x
60xx0803|OverlayCodeTableLocation|Overlay Code Table Location|AT|1-n|R|x
60xx0804|OverlayBitsForCodeWord|Overlay Bits For Code Word|US|1|R|x
60xx1001|OverlayActivationLayer|Overlay Activation Layer|CS|1||x
60xx1100|OverlayDescriptorGray|Overlay Descriptor - Gray|US|1|R|x
60xx1101|OverlayDescriptorRed|Overlay Descriptor - Red|US|1|R|x
60xx1102|OverlayDescriptorGreen|Overlay Descriptor - Green|US|1|R|x
60xx1103|OverlayDescriptorBlue|Overlay Descriptor - Blue|US|1|R|x
60xx1200|OverlaysGray|Overlays - Gray|US|1-n|R|x
60xx1201|OverlaysRed|Overlays - Red|US|1-n|R|x
60xx1202|OverlaysGreen|Overlays - Green|US|1-n|R|x
60xx1203|OverlaysBlue|Overlays - Blue|US|1-n|R|x
60xx1301|ROIArea|ROI Area|IS|1||x
60xx1302|ROIMean|ROI Mean|DS|1||x
60xx1303|ROIStandardDeviation|ROI Standard Deviation|DS|1||x
60xx1500|OverlayLabel|Overlay Label|LO|1||x
60xx3000|OverlayData|Overlay Data|OB/OW|1||x
60xx4000|OverlayComments|Overlay Comments|LT|1|R|x
7FE00001|ExtendedOffsetTable|Extended Offset Table|OV|1||
7FE00002|ExtendedOffsetTableLengths|Extended Offset Table Lengths|OV|1||
7FE00003|EncapsulatedPixelDataValueTotalLength|Encapsulated Pixel Data Value Total Length|UV|1||
7FE00008|FloatPixelData|Float Pixel Data|OF|1||
7FE00009|DoubleFloatPixelData|Double Float Pixel Data|OD|1||
7FE00010|PixelData|Pixel Data|OB/OW|1||
7FE00020|CoefficientsSDVN|Coefficients SDVN|OW|1|R|
7FE00030|CoefficientsSDHN|Coefficients SDHN|OW|1|R|
7FE00040|CoefficientsSDDN|Coefficients SDDN|OW|1|R|
7fxx0010|VariablePixelData|Variable Pixel Data|OB/OW|1|R|x
7fxx0011|VariableNextDataGroup|Variable Next Data Group|US|1|R|x
7fxx0020|VariableCoefficientsSDVN|Variable Coefficients SDVN|OW|1|R|x
7fxx0030|VariableCoefficientsSDHN|Variable Coefficients SDHN|OW|1|R|x
7fxx0040|VariableCoefficientsSDDN|Variable Coefficients SDDN|OW|1|R|x
FFFAFFFA|DigitalSignaturesSequence|Digital Signatures Sequence|SQ|1||
FFFCFFFC|DataSetTrailingPadding|Data Set Trailing Padding|OB|1||
FFFEE000|Item|Item||1||
FFFEE00D|ItemDelimitationItem|Item Delimitation Item||1||
FFFEE0DD|SequenceDelimitationItem|Sequence Delimitation Item||1||
`;
