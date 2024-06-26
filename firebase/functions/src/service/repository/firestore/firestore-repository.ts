import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  FirestoreDataConverter,
  Query,
  QueryDocumentSnapshot,
  QuerySnapshot,
  Transaction,
  UpdateData,
  WriteBatch,
  WriteResult,
} from "firebase-admin/firestore";
import {DocumentModel} from "../../../model/firestore/document-model";

export abstract class FirestoreRepository<T extends DocumentModel> {
  protected firestore: Firestore;
  protected collectionPath: string;

  constructor(firestore: Firestore, collectionPath: string) {
    this.firestore = firestore;
    this.collectionPath = collectionPath;
  }

  protected getCollection<T extends DocumentModel>(): CollectionReference<T> {
    return this.firestore
      .collection(this.collectionPath)
      .withConverter(this.converter<T>());
  }

  protected getSubCollection<S extends DocumentModel>(
    docRef: DocumentReference<T>,
    subCollectionPath: string,
  ): CollectionReference<S> {
    return docRef
      .collection(subCollectionPath)
      .withConverter(this.converter<S>());
  }

  protected async add(data: T) {
    return this.getCollection().add(data);
  }

  /* Transaction */

  protected async runTransaction<R>(
    operation: (tx: Transaction) => Promise<R>,
  ): Promise<R> {
    return this.firestore.runTransaction(operation);
  }

  protected async getInTx(
    tx: Transaction,
    docRef: DocumentReference,
  ): Promise<DocumentSnapshot<T>>;
  protected async getInTx(
    tx: Transaction,
    query: Query<T>,
  ): Promise<QuerySnapshot<T>>;
  protected async getInTx(tx: Transaction, arg: DocumentReference | Query<T>) {
    if (arg instanceof DocumentReference) {
      return tx.get(arg);
    } else {
      return tx.get(arg);
    }
  }

  protected async addInTx<S extends DocumentModel>(
    tx: Transaction,
    docRef: DocumentReference<S>,
    data: S,
    options?: FirebaseFirestore.SetOptions,
  ) {
    return options === undefined
      ? tx.set(docRef, data)
      : tx.set(docRef, data, options);
  }

  protected async addSubDocInTx<S extends DocumentModel>(
    tx: Transaction,
    docRef: DocumentReference<T>,
    subCollectionName: string,
    data: S,
  ) {
    const subDocRef = docRef.collection(subCollectionName).doc();
    return tx.set(subDocRef, data);
  }

  protected async updateInTx(
    tx: Transaction,
    docRef: DocumentReference<T>,
    data: T,
  ) {
    const obj = data.parseObj();
    tx.update(docRef, obj as UpdateData<T>);
  }

  /* Batch */

  protected startBatch(): WriteBatch {
    return this.firestore.batch();
  }

  protected addWithBatch(batch: WriteBatch, data: T) {
    batch.set(this.getCollection().doc(), data);
  }

  protected setWithBatch(
    batch: WriteBatch,
    docRef: DocumentReference<T>,
    data: T,
    options?: FirebaseFirestore.SetOptions,
  ) {
    options === undefined
      ? batch.set(docRef, data)
      : batch.set(docRef, data, options);
  }

  protected addSubDocumentWithBatch<S extends DocumentModel>(
    batch: WriteBatch,
    docRef: DocumentReference<T>,
    subCollectionName: string,
    data: S,
  ) {
    const subDocRef = this.getSubCollection<S>(docRef, subCollectionName).doc();
    batch.set(subDocRef, data);
  }

  protected updateWithBatch(
    batch: WriteBatch,
    docRef: DocumentReference<T>,
    data: T,
  ) {
    batch.update(docRef, data as UpdateData<T>);
  }

  protected deleteInBatch(batch: WriteBatch, docRef: DocumentReference<T>) {
    batch.delete(docRef);
  }

  protected commitBatch(batch: WriteBatch): Promise<WriteResult[]> {
    return batch.commit();
  }

  protected converter<T extends DocumentModel>(): FirestoreDataConverter<T> {
    return {
      toFirestore(model: T) {
        return model.parseObj();
      },
      fromFirestore(snapshot: QueryDocumentSnapshot) {
        return snapshot.data() as T;
      },
    };
  }

  protected exists(ss: QuerySnapshot<DocumentData>): boolean;
  protected exists(ss: QueryDocumentSnapshot<DocumentData>): boolean;
  protected exists(ss: DocumentSnapshot<DocumentData>): boolean;
  protected exists(ss: unknown): boolean {
    if (ss instanceof QuerySnapshot) {
      let exist = false;
      ss.forEach((d) => {
        if (d.exists) exist = true;
      });
      return exist;
    } else if (ss instanceof QueryDocumentSnapshot) {
      return ss.exists;
    } else if (ss instanceof DocumentSnapshot) {
      return ss.exists;
    } else {
      throw new Error("unexpected type");
    }
  }

  protected idAndData<T>(ss: QuerySnapshot<DocumentData>) {
    if (this.exists(ss)) {
      return {};
    }
    const documentIdAndData: Record<string, T> = ss.docs.reduce(
      (acc, doc) => {
        acc[doc.id] = doc.data() as T;
        return acc;
      },
      {} as Record<string, T>,
    );
    return documentIdAndData;
  }
}
